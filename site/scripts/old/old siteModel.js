// Vue and site Site libraries for model...
import vlib from './siteVueLib3.js';


// shared data (across apps) declarations
var page = 'home';
const pages = {
    home: {
        classname: 'home',
        component: 'generic',
        content: 'Loading...',
        logo: '/images/shopping.png'
    },
    cms: {
        label: 'CMS',
        src: '/cms.html'
    },
    shop: {
        lazy: 'shop',
        component: 'shop',
        label: 'Shopping Network'
    },
    links: {},
    about: {
        classname: 'about',
        logo: true,
        menu: 'home,about'
    }
};
const user = {
    member: '' 
};


// define header app...
const header = Vue.createApp({
    inject: ['app'],
    data: function() { return {
        dialog: '',
        page: page,
        pages: pages,
        user: user
    }},
    computed: {
        cmsEnable: function() { return this.$data.user.member.split(',').some(p=>['admin','cms'].includes(p)); },
        pg: function() { return this.pages[this.page]||{}; },
        pageMenu: function() { return (this.pg.menu ? this.pg.menu.toLowerCase().split(',') : Object.keys(this.pages))
          .filter(i=>i!='cms'||this.cmsEnable).map(k=>[k,this.pages[k].label||k.charAt(0).toUpperCase()+k.slice(1)]); }
    },
    methods: {
        pick(item) { let page = item.toLowerCase(); /*this.loadContent(item);*/ },
        popup(ref) { this.dialog = this.dialog!==ref ? ref : ''; }
    }
});

['fetchJSON', 'storage'].forEach(k=>{ header.use(vlib.plugins[k]); });
['debounce', 'icon', 'if-class', 'pattern', 'tip'].forEach(k=>{ header.directive(k,vlib.directives[k]); });
['blk-x', 'dialog-login', 'dialog-logout', 'dialog-account'].forEach(k=>{ header.component(k,vlib.components[k]); });
header.provide('app',header);


// define main app...
const main = Vue.createApp({
    inject: ['app'],
    data: function() { return {
        lazyFiles: {
                md: { sources: ['mdIt','attrs','lnk','div','span'], done: '$defineMarkdown' },
                mdIt: { type:'script', src: '/cdn/markdown-it/8.4.2/markdown-it.min.js' }, 
                attrs: { type:'script', src: '/cdn/markdown-it/markdown-it-attrs.min.js' },
                lnk: { type:'script', src: '/cdn/markdown-it/markdown-it-link-plus.min.js' },
                div: { type:'script', src: '/cdn/markdown-it/markdown-it-div.min.js' },
                span: { type:'script', src: '/cdn/markdown-it/markdown-it-span.min.js' }
            },
        page: page,
        pages: pages,
        user: user
    }},
    computed: {
        cmsEnable: function() { return this.user.member.split(',').some(p=>['admin','cms'].includes(p)); },
        pg: function() { return this.pages[this.page]||{}; },
        pageClass: function() { return this.pg.classname||this.page; },
        pageLogo: function() { return this.pg.logo && (this.pg.logo!==true ? this.pg.logo : this.pages.home.logo); },
        pageMenu: function() { return (this.pg.menu ? this.pg.menu.toLowerCase().split(',') : Object.keys(this.pages))
          .filter(i=>i!='cms'||this.cmsEnable).map(k=>[k,this.pages[k].label||k.charAt(0).toUpperCase()+k.slice(1)]); },
        pagesLazyLoads: function() { return this.pages.filterByKey(p=>p.lazy); },
        pagesFrames: function() { return this.pages.filterByKey(p=>p.src); },
        pagesOthers: function() { return this.pages.filterByKey((p,n)=>(n!='home')&&!p.src&&!p.lazy); },
        shopping: function() { return this.user.member.split(',').some(p=>['admin','ssn','shopper','shop'].includes(p)); }
    },
//    mounted() {console.log('app:',this.app);console.log('root:',this.$root);console.log('parent:',this.$parent);},
    methods: {
        // define Markdown render instance creation function needed as callback to lazy load...
        $defineMarkdown: function () {
            let md = window.markdownit('commonmark')
                .use(markdownItAttrs).use(markdownitLinkPlus).use(markdownitDiv).use(markdownitSpan);
            window.md2html = function(content,strip=false) {
                let rendered = md.render(content);
                return strip ? rendered.replace(/^<p>|<\/p>(?:\n)?$/gm,'') : rendered;
            }
        },
        custom: function(p) {
            let c=this.pages[p].component || p;
            return this.app.component(c)!==undefined?c:'generic';
        },
        historyRestore: function(event) {             // callback for back and forward buttons
            if ('state' in event && event.state!=null) {
            this.page = event.state.page;             // content already loaded if in history, so just point to it
            };
        },
        historySave: function(state={}) {             // build an informational state and push to history
            state.mergekeys({ title: state.title || (this.pages[this.page]||{}).title || document.title || '',
                hash: state.hash ? '#'+state.hash.replace(/^#/,'') : '', page: state.page || this.page }); 
            state.url = state.url || (window.location.base + '/' + (state.page=='home' ? '' : state.page + state.hash));
            window.history.pushState(state,state.title,state.url);
        },
        init: function() {
            window.md2html = ()=>'';
            window.vueCallback = (()=>{ let self=this;
                return (v,name)=>{ [self.pages[name].vue,self.pages[name].loaded]=[v,true]; return self; } })();  // IIFE
            // redirect if base page is not home; must be before history.replaceState   
            var redirect = location.hash ? location.pathname+location.hash : location.pathname; 
            // load home data synchronously...
            window.history.replaceState({page: 'home', title: 'Talking Coyotes', url: '/'},'Talking Coyotes','/');
            if (redirect!='/') vm.loadContent(redirect); // optionally load redirected page (which will save state after)
            window.onpopstate = this.historyRestore;  // fired when back or forward buttons pushed to capture changes
            this.$el.classList.remove('none');
        },
        loadContent: function(ref) {
console.log(`load: ${ref},${this.page}`);
            ref = ref.replace('/','');
console.log('loadContent:',ref,this.pages[ref]);
            this.dialog = '';
            //this.page = '';
            let active = this.pages[ref];
console.log(`active: ${JSON.stringify(this.pages[ref])}`);
            if (!active) return;                                // page not defined
            if (active.loaded) {                                // already loaded
            this.page = ref;
            } else if (active.lazy) {                           // lazyloading content
console.log('loadContent lazy...',ref);
            this.page = ref;
            } else if (active.src) {                            // iframe ...
            this.$refs[ref][0].src = this.pages[ref].src;
            this.pages[ref].loaded = true;                    // ensures dependencies load only one time
            this.page = ref;
            } else {                                            // a loadable page section
            // load section data
            this.page = ref;
            // after loaded this.pages[ref].loaded = true; this.page = ref;
            };
            this.historySave();
console.log('loadContent*:',ref,this.pages[ref],window.history);
        },
        pageLoaded: function() { this.$set(this.pg,'loaded',true); },   // fired when lazyloaded dependencies complete
        test: function(x) { if (x!==undefined) {this.user.x = x; }; return this.user.x }
    }
});

Object.keys(vlib.plugins).forEach(k=>{ main.use(vlib.plugins[k]); });
Object.keys(vlib.directives).forEach(k=>{ main.directive(k,vlib.directives[k]); });
Object.keys(vlib.components).forEach(k=>{ main.component(k,vlib.components[k]); });
main.provide('app',main);


// mount each app to root component...
header.mount('#header');
main.mount('#main');


// assign apps to window for console access
window.header = header;
window.main = main;
