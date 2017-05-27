// Lists

'use strict';

// Search `[-+*][\n ]?`, returns next pos arter marker on success
// or -1 on fail.
function skipBulletListMarker(state, startLine) {
	var marker, pos, max, ch;

	pos = state.bMarks[startLine] + state.tShift[startLine];
	max = state.eMarks[startLine];

	marker = state.src.charCodeAt(pos++);
	// Check bullet
	if (marker !== 0x2A/* * */ &&
	    marker !== 0x2D/* - */ &&
	    marker !== 0x2B/* + */) {
		return -1;
	}

	if (pos <= max) {
		ch = state.src.charCodeAt(pos);

		if (ch !== 0x09/* tab */ && ch !== 0x20/* space */) {
			// " -test " - is not a list item
			return -1;
		}
	}

	return pos;
}

// Search `(\w{1,2}|[IVXivx]+)[.)][\n ]?`, returns
// next pos after marker on success or -1 on fail.
function skipOrderedListMarker(state, startLine) {
	var ch,
	    start = state.bMarks[startLine] + state.tShift[startLine],
	    pos = start,
	    max = state.eMarks[startLine];

	// List marker should have at least 2 chars (digit + dot)
	if (pos + 1 >= max) { return -1; }

	ch = state.src.charCodeAt(pos++);

	if (ch < 0x30/* 0 */ || ch > 0x7A/* z */ || (ch > 0x39/* 0 */ && ch < 0x41/* A */) || (ch > 0x5A/* Z */ && ch < 0x61/* a */)) { return -1; }
	
	for (var ff = 0;ff < 40;ff++) {
		// EOL -> fail
		if (pos >= max) { return -1; }

		ch = state.src.charCodeAt(pos++);
		// If it's a valid character get the next one
		if ((ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) ||
		    ch === 0x49/* I */ ||
		    ch === 0x56/* V */ ||
		    ch === 0x58/* X */ ||
		    ch === 0x69/* i */ ||
		    ch === 0x76/* v */ ||
		    ch === 0x78/* x */) {
			// List marker should have no more than 9 digits
			// (prevents integer overflow in browsers)
			if (pos - start >= 10) { return -1; }
			
			continue;
		}
		else if ((ch >= 0x41/* A */ && ch <= 0x5A/* Z */) || (ch >= 0x61/* a */ && ch <= 0x7A/* z */)){
			// List marker should not be more than 2 characters
			// long unless Roman numerals, cuz it might just be a word
			if (pos - start >= 2) { return -1; }
			
			continue;
		}

		// found valid marker
		if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
			break;
		}

		return -1;
	}


	if (pos <= max) {
		ch = state.src.charCodeAt(pos);

		if (ch !== 0x09/* tab */ && ch !== 0x20/* space */) {
			// " 1.test " - is not a list item
			return -1;
		}
	}
	return pos;
}

function markTightParagraphs(state, idx) {
	var i, l,
			level = state.level + 2;

	for (i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
		if (state.tokens[i].level === level && state.tokens[i].type === 'paragraph_open') {
			state.tokens[i + 2].hidden = true;
			state.tokens[i].hidden = true;
			i += 2;
		}
	}
}

function numberType(markerValue) {
	if (!isNaN(markerValue)) {
		return "1";
	}
	else {
		var charCode = markerValue.charCodeAt(0);
		if (charCode == 73 ||
		    charCode == 86 ||
		    charCode == 88) {
			return "I"
		}
		else if (charCode == 105 ||
		         charCode == 118 ||
		         charCode == 120) {
			return "i";
		}
		else if (charCode >= 65 && charCode <= 90) {
			return "A";
		}
		else {
			return "a";
		}
	}
}

function numberValue(markerValue, markerType) {
	if (markerType === "1") {
		return Number(markerValue);
	}
	else if (markerType === "I" || markerType === "i") {
		var romans = {
			'X': 10,
			'V': 5,
			'I': 1
		};
		markerValue = markerValue.toUpperCase();
		var output = 0;
		var highest = false;
		var num;
		for (var i = markerValue.length - 1; i >= 0; i--) {
			num = romans[markerValue.substr(i, 1)] || 0;
			highest = (num > highest ? num : highest);
			output = (num < highest ? (output - num) : (output + num));
		}
		return output;
	}
	else if (markerType === "A") {
		return markerValue.charCodeAt(0) - 64;
	}
	else {
		return markerValue.charCodeAt(0) - 96;
	}
}

function fancyList(state, startLine, endLine, silent) {
	var ch,
	    contentStart,
	    i,
	    indent,
	    indentAfterMarker,
	    initial,
	    isOrdered,
	    itemLines,
	    l,
	    listLines,
	    listTokIdx,
	    markerCharCode,
	    markerType,
	    markerValue,
	    markerString,
	    max,
	    nextLine,
	    offset,
	    oldIndent,
	    oldLIndent,
	    oldMarkerLength,
	    oldParentType,
		oldPosAfterMarker,
	    oldTShift,
	    oldTight,
	    pos,
	    posAfterMarker,
	    prevEmptyEnd,
	    start,
	    terminate,
	    terminatorRules,
	    token,
	    isTerminatingParagraph = false,
	    tight = true;

	// if it's indented more than 3 spaces, it should be a code block
	if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

	// limit conditions when list can interrupt
	// a paragraph (validation mode only)
	if (silent && state.parentType === 'paragraph') {
		// Next list item should still terminate previous list item;
		//
		// This code can fail if plugins use blkIndent as well as lists,
		// but I hope the spec gets fixed long before that happens.
		//
		if (state.tShift[startLine] >= state.blkIndent) {
			isTerminatingParagraph = true;
		}
	}

	// Detect list type and position after marker
	if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
		isOrdered = true;
		start = state.bMarks[startLine] + state.tShift[startLine];
		markerString = state.src.substr(start, posAfterMarker - start - 1);
		markerType = numberType(markerString);
		markerValue = numberValue(markerString, markerType);
		
		// If we're starting a new ordered list right after
		// a paragraph, it should start with 1.
		if (isTerminatingParagraph && markerValue !== 1) return false;

	} else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
		isOrdered = false;

	} else {
		return false;
	}

	// If we're starting a new unordered list right after
	// a paragraph, first line should not be empty.
	if (isTerminatingParagraph) {
		if (state.skipSpaces(posAfterMarker) >= state.eMarks[startLine]) return false;
	}

	// We should terminate list on style change. Remember first one to compare.
	markerCharCode = state.src.charCodeAt(posAfterMarker - 1);

	// For validation mode we can terminate immediately
	if (silent) { return true; }

	// Start list
	listTokIdx = state.tokens.length;

	if (isOrdered) {
		token       = state.push('ordered_list_open', 'ol', 1);
		if (markerValue == 1) {
			token.attrs = [ [ 'type', markerType ] ];
		}
		else {
			token.attrs = [ [ 'type', markerType ], [ 'start', markerValue ] ];
		}

	} else {
		token       = state.push('bullet_list_open', 'ul', 1);
	}

	token.map    = listLines = [ startLine, 0 ];
	token.markup = String.fromCharCode(markerCharCode);

	//
	// Iterate list items
	//

	nextLine = startLine;
	prevEmptyEnd = false;
	terminatorRules = state.md.block.ruler.getRules('list');

	oldParentType = state.parentType;
	state.parentType = 'list';

	while (nextLine < endLine) {
		pos = posAfterMarker;
		max = state.eMarks[nextLine];

		initial = offset = state.sCount[nextLine] + posAfterMarker - (state.bMarks[startLine] + state.tShift[startLine]);

		while (pos < max) {
			ch = state.src.charCodeAt(pos);

			if (ch === 0x09) {
				offset += 4 - (offset + state.bsCount[nextLine]) % 4;
			} else if (ch === 0x20) {
				offset++;
			} else {
				break;
			}
			pos++;
		}

		contentStart = pos;

		if (contentStart >= max) {
			// trimming space in "-    \n  3" case, indent is 1 here
			indentAfterMarker = 1;
		} else {
			indentAfterMarker = offset - initial;
		}

		// If we have more than 4 spaces, the indent is 1
		// (the rest is just indented code block)
		if (indentAfterMarker > 4) { indentAfterMarker = 1; }

		// "  -  test"
		//  ^^^^^ - calculating total length of this thing
		indent = initial + indentAfterMarker;
		
		// Remove whitespace from long bullet points so tabs work
		markerString = state.src.substr(state.bMarks[nextLine] + state.tShift[nextLine], posAfterMarker - state.bMarks[nextLine] - state.tShift[nextLine] - 1);
		if (markerString.length > 2) {
			indent -= markerString.length - 2;
			ch = state.src.charCodeAt(state.bMarks[nextLine] + state.tShift[nextLine] - 1);
			if (ch === 0x09) {
				state.src = state.src.substring(0, state.bMarks[nextLine] + state.tShift[nextLine] - 1) + " ".repeat(Math.max(4 - markerString.length + 2, 0)) + state.src.substring(state.bMarks[nextLine] + state.tShift[nextLine]);
				state.tShift[nextLine] += 3 - markerString.length + 2;
				offset += 3 - markerString.length + 2;
				state.sCount[nextLine] += 3 - markerString.length + 2;
				state.eMarks[nextLine] += 3 - markerString.length + 2;
				max += 3 - markerString.length + 2;
				for (i = nextLine + 1; i <= endLine; i++) {
					state.bMarks[i] += 3 - markerString.length + 2;
					state.eMarks[i] += 3 - markerString.length + 2;
				}
			}
			else {
				for (i = 0; i < markerString.length - 2; i++) {
					state.src = state.src.substring(0, state.bMarks[nextLine] + state.tShift[nextLine] - 1) + state.src.substring(state.bMarks[nextLine] + state.tShift[nextLine]);
				}
				state.tShift[nextLine] -= markerString.length - 2;
				offset -= markerString.length - 2;
				state.sCount[nextLine] -= markerString.length - 2;
				state.eMarks[nextLine] -= markerString.length - 2;
				max -= markerString.length - 2;
				for (i = nextLine + 1; i <= endLine; i++) {
					state.bMarks[i] -= markerString.length - 2;
					state.eMarks[i] -= markerString.length - 2;
				}
			}
		}

		// Run subparser & write tokens
		token        = state.push('list_item_open', 'li', 1);
		token.markup = String.fromCharCode(markerCharCode);
		token.map    = itemLines = [ startLine, 0 ];

		oldIndent = state.blkIndent;
		oldTight = state.tight;
		oldTShift = state.tShift[startLine];
		oldLIndent = state.sCount[startLine];
		state.blkIndent = indent;
		state.tight = true;
		state.tShift[startLine] = contentStart - state.bMarks[startLine];
		state.sCount[startLine] = offset;

		if (contentStart >= max && state.isEmpty(startLine + 1)) {
			// workaround for this case
			// (list item is empty, list terminates before "foo"):
			// ~~~~~~~~
			//   -
			//
			//     foo
			// ~~~~~~~~
			state.line = Math.min(state.line + 2, endLine);
		} else {
			state.md.block.tokenize(state, startLine, endLine, true);
		}

		// If any of list item is tight, mark list as tight
		if (!state.tight || prevEmptyEnd) {
			tight = false;
		}
		// Item become loose if finish with empty line,
		// but we should filter last element, because it means list finish
		prevEmptyEnd = (state.line - startLine) > 1 && state.isEmpty(state.line - 1);

		state.blkIndent = oldIndent;
		state.tShift[startLine] = oldTShift;
		state.sCount[startLine] = oldLIndent;
		state.tight = oldTight;

		token        = state.push('list_item_close', 'li', -1);
		token.markup = String.fromCharCode(markerCharCode);

		nextLine = startLine = state.line;
		itemLines[1] = nextLine;
		contentStart = state.bMarks[startLine];

		if (nextLine >= endLine) { break; }

		//
		// Try to check if list is terminated or continued.
		//
		if (state.sCount[nextLine] < state.blkIndent) { break; }

		// fail if terminating block found
		terminate = false;
		for (i = 0, l = terminatorRules.length; i < l; i++) {
			if (terminatorRules[i](state, nextLine, endLine, true)) {
				terminate = true;
				break;
			}
		}
		if (terminate) { break; }

		// fail if list has another type
		if (isOrdered) {
			posAfterMarker = skipOrderedListMarker(state, nextLine);
			if (posAfterMarker < 0) { break; }
		} else {
			posAfterMarker = skipBulletListMarker(state, nextLine);
			if (posAfterMarker < 0) { break; }
		}

		if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) { break; }
	}

	// Finalize list
	if (isOrdered) {
		token = state.push('ordered_list_close', 'ol', -1);
	} else {
		token = state.push('bullet_list_close', 'ul', -1);
	}
	token.markup = String.fromCharCode(markerCharCode);

	listLines[1] = nextLine;
	state.line = nextLine;

	state.parentType = oldParentType;

	// mark paragraphs tight if needed
	if (tight) {
		markTightParagraphs(state, listTokIdx);
	}

	return true;
};
