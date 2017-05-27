# markdown-it-fancy-lists
A plugin for markdown-it adding lettered and Roman numeral ordered lists

I wanted fancy lists for markdown, and markdown-it was a _fairly_ easily extensible one that's fast and standards-compliant, so I made this plug-in.

## Use
I am not using node. I just set it up with pure HTML and JavaScript.  
Put this in your HTML:
```html
<script src="https://cdn.jsdelivr.net/markdown-it/8.3.1/markdown-it.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Ullallulloo/markdown-it-fancy-lists@1.0/markdown-it-fancy-lists.min.js">
```
Put this in your JavaScript:
```javascript
var md = window.markdownit({breaks: true, linkify: true});
md.block.ruler.at('list', fancyList, { alt: [ 'paragraph', 'reference', 'blockquote' ] });
```
I could probably add node support pretty easily though?

### Disclaimers
 * This violates the CommonMark standard in multiple ways:
   * Obviously fancy lettered and Roman numeral lists are not in the standard
   * Since Roman numerals have a tendency to get long, it exacerbates a thing in the standard that I dislike, which is that it requires you to put fewer spaces behind longer markers. This makes the text align with monospace fonts, but looks stupid in any other font. Also, this means that tabs will not align right, especially with long things. I do a rather hacky thing and strip out these spaces in the parser if the bullet point's long, which makes things slightly inconsistent. I can fix that by running it on two long things, but that would make it slower. Also I could make this an option maybe. Idk.
