// site specific library...

import {lazyLoad} from '/scripts/lazyLoader.js';

console.log('imported:', lazyLoad===undefined)
console.log('lazy:', lazy===undefined)

var lazy = {   
    filesOnDemand: {
        md: { loaded: false, type:'script', src: '/cdn/markdown-it/8.4.2/markdown-it.min.js', 
            inc: ['attrs','lnk','div','span'], callback: 'defineMarkdown' },
        attrs: { loaded: false, type:'script', src: '/cdn/markdown-it/markdown-it-attrs.min.js' },
        lnk: { loaded: false, type:'script', src: '/cdn/markdown-it/markdown-it-link-plus.min.js' },
        div: { loaded: false, type:'script', src: '/cdn/markdown-it/markdown-it-div.min.js' },
        span: { loaded: false, type:'script', src: '/cdn/markdown-it/markdown-it-span.min.js' }
    },
    // define Markdown render instance needed by Vue...
    defineMarkdown: function () {
        let md = window.markdownit('commonmark')
        .use(markdownItAttrs).use(markdownitLinkPlus).use(markdownitDiv).use(markdownitSpan);
        window.md2html = function(content,strip=false) {
            let rendered = md.render(content);
            return strip ? rendered.replace(/^<p>|<\/p>(?:\n)?$/gm,'') : rendered;
        }
    }
};

console.log('lazy:', lazy===undefined);
console.log('imported:', lazyLoad===undefined);
window.lazyLoad = lazyLoad;

//export function lazyLoad;
console.log('window:',window['lazy']);
console.log('window:',window['lazyLoad']);
