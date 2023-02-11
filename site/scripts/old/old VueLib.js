// Basic Vue Extensions Library of common elements...

// "app scope" variable, $$app, used as a site specific placeholder object to not collide with Vue internals
// may be extended by other site specific functions and data...
// <span>{{$$app.debug(true,true)}}</span>
Vue.use(function(){
  Vue.prototype.$$app = {
    debug(d,v){ if (d!==undefined) this.DEBUG=d; if (v!==undefined) this.VERBOSE=v; 
      return {debug: this.DEBUG, verbose: this.VERBOSE}; },
    DEBUG: false,   //  global debug settings, treat as constants, get,set with debug function
    VERBOSE: false
  };
});


// custom directive to autosize a textarea element
// <textarea v-autosize></textarea>
Vue.directive('autosize', {
  bind(el,binding,vnode) {
    let listener=function(e) {
      if (e.type!=='input') e.target.style.height=0; // reset for mouseover to resize smaller if needed
      if (e.target.scrollHeight!==e.target.clientHeight) e.target.style.height=32+e.target.scrollHeight+'px';
    };
    el.addEventListener('input',listener);
    el.addEventListener('mouseover',listener);
  }
});


// custom directive to obfuscate email contacts
// <span v-contact:[me]>Optional initial text here</span>
// where me represents an object: who (i.e. dave), tld (i.e. com), host (i.e.gmail), or domain (i.e. gmail.com) 
// and optional subject; event defaults to click
Vue.directive('contact',{
  bind(el, binding, vnode) {
    var ct = binding.arg;
    var mail = `${ct.who}@${ct.domain || ct.host+'.'+ct.tld}`;
    var subject = ct.subject || ct.subj || '';
    function self() {
      if (el.innerHTML != mail) el.innerHTML = mail;  // on first click
      window.location.href = `mailto:${mail}?subject=${subject}`;
    };
    if (!el.innerHTML) el.innerHTML = ct.who;
    const events = Object.keys(binding.modifiers).length ? Object.keys(binding.modifiers) : ['click'];
    events.forEach(e=>el.addEventListener(e,self));
  }
});


// directive to filter keystrokes for debounced input; sends a single event (500ms) after typing ends 
// example (defaults: keyup event and 500ms delay): <input type="text" v-debounce="chg">
// example: <input type="text" v-debounce:1s.click="chg">
// note: wrap event function with anonymous function, e.g. "()=>chg('me')"
Vue.directive('debounce', {
  bind (el,binding,vnode) {
    function db(fn,dly) {
      var timex=null;
      return (...args)=>{
        clearTimeout(timex);
        timex = setTimeout(()=>fn.apply(vnode.context,args),dly);
      }
    }
    const wait = Number(String(binding.arg).replace('ms','').replace('s','000')) || 500;
    const dbCB = db(binding.value,wait);
    const events = Object.keys(binding.modifiers).length ? Object.keys(binding.modifiers) : ['keyup'];
    events.forEach(e=>el.addEventListener(e,dbCB));
  }
});


// custom directive to selectively hide elements based on expiration date
// <element v-expires='2019-06-06T12:00:00.000Z'></element>
Vue.directive('expires', function (el, binding) {
  var now = new Date().toISOString();
  if ((binding.value||now)<now) el.style.display = 'none';
});


// custom directive to define icons; supports Google Material Design and icomoon.io custom woff
//<i v-icon:icon_name><>  <i v-icon:[expression]"><><i v-icon="'name with spaces'"><>
Vue.directive('icon', function (el,binding,vnode) { // bind and update...
    var icon = binding.arg || binding.value || '';
    if (icon.startsWith('ico-')) {  // icomoon icons
      if (el.dataset.icon) el.classList.remove(el.dataset.icon);
      el.dataset.icon = icon;
      el.classList.add(icon);
    } else {                        // material design icons
      if (!el.classList.contains('material-icons')) el.classList.add('material-icons');
      el.innerHTML = icon;
    };
    Object.keys(binding.modifiers).forEach(m=> el.classList.add(m));
});


// custom directive to conditionally add a class to an element
// <element v-if-class:extra='test'></element>
Vue.directive('if-class', function (el, binding) {
  if (binding.value) { el.classList.add(binding.arg); } else { el.classList.remove(binding.arg); };
});


// custom directive to add 'name-based' regular expression patterns to inputs...
//   replace "<input pattern='[a-z0-9]{3,15}'>" with "<input v-pattern:username>" 
//   or dynamically assign by an expression as in "<input v-pattern="expression">" where expression resolves to a pattern name
//   or define a custom pattern array [regex,description] as in "<input v-pattern="['\\d{6}','6-digit code']">"
Vue.directive('pattern', {
  bind (el,binding) {
    const patterns = {
      code: ['\\d{6,}','6 digit activation/authorization code'],
      email: ['^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$','Legal email address required'],
      fullname: ['[A-Za-z\\- ]+','Enter your fullname'],
      pw: ['\\d{6,}|.{8,}','Account password/code required'],
      password: ['^(?=.*\\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[\\W_]).{8,}$','>8 characters, including lower and upper case letter, number, and special character'],
      phone: ['(?:\\+1)?\\d{10}','Enter a 10 digit phone number'],
      text: ["^[\\w .~()'!*:@,;+?-]*$",'Any general text input'],
      username: ['[a-z0-9]{3,15}','Username may contain 3-15 (lowercase) letters and numbers']
    };
    var arg = binding.arg || binding.value;
    var pattern = arg instanceof Array ? arg : patterns[arg]||['.*',''];
    if (binding.modifiers['desc']) return el.innerHTML=pattern[1]||'';  // 'desc' modifier sets content
    el.pattern = pattern[0]; // otherwise set pattern and title
    el.title = pattern[1];
  }
});


// fetchJSON: Plugin to add browser promise based fetch function directly to Vue instance, with support for older browsers
// optimized (i.e. simplified) for direct GET/POST/PUT of JSON data...
Vue.use(function(Vue) {

  // get headers for convenience
  function getHeaders(response) {
    var hdrs={};
    for (var k of response.headers.keys()) { hdrs[k]=response.headers.get(k); };
    return hdrs;
  };

  // safely parse raw text into json...
  // jxOK indicates successful parsing; jxError: indicates if message contains error
  function safeParseJSON(txt='') {
    var jx={}; var jxOK=false;
    try { jx=JSON.parse(txt); jxOK=true; } catch(e) {};
    var jxError = jx && 'error' in jx;  // could be null
    return {jx:jx, jxOK:jxOK, jxError:jxError};
  };      
    
  // fetch call...
  Vue.prototype.fetchJSON = async function(method,url,options={}) {
    var verbose = options.verbose || this.$$app.debug().verbose;
    var id = options.id || uniqueID(4,10);
    var scribe = function(stage,detail) { if (verbose) console.log(`##${id} fetch[${stage}]: ${detail}`); };
    options.method = method;  // add method to options, required.
    options.url = url;        // save url to options for return with result
    if (!options.direct) {
      // assume json data post, format request properly with content headers...
      if (('body' in options) && (typeof options.body=='object')) options.body = JSON.stringify(options.body);
      options.headers = options.headers || {};
      options.headers['Accept'] = 'application/json, text/plain, */*';  // automatically add json headers
      options.headers['Content-Type'] = 'application/json';
    };
    // optionally log for info...
    scribe('request',options.method +' '+ url);
    // make request, pass request options to response and perform post process parsing...
    try {
      var response = await fetch(url,options);
    } catch (e) { response={hdrs:{}}; scribe('catch',e.toString()); };  // failed response 
    response.request = options; // add request (options, including method and URL) to result
    scribe('status',response.status + " ==> " + response.statusText);
    response.ok = (response.status >= 200) && (response.status < 300);
    response.error = !response.ok ? response.status : false;
    if (response.ok) response.hdrs = getHeaders(response);
    scribe('headers','('+Object.keys(response.hdrs).length+') ' + JSON.stringify(response.hdrs,null,2));
    if (response.ok) response.raw = await response.text(); // text returns a promise
    var j = safeParseJSON(response.raw);
    Object.assign(response,j);
    scribe('json','['+(j.jxOK?'OK':'ERROR')+']:: ' + JSON.stringify(j.jx,null,2));
    return response;
  }
});


// storage: Plugin to add local and session storage directly to Vue instance
// optimized for JSON; adds getters and setters to store objects vs just strings, semi-transparent local vs session
Vue.use(function(Vue) {

  var storage = {}; // emulated storage - non-persistant, but prevents errors when Storage undefined
  var store = {};   // universal storage object, keys 'shared or common' between local and session, i.e. only use key once

  // private function to define getter/setter on 'store' object for each key stored...
  function define(store,storage,key){
    Object.defineProperty(store,key,{
      // getter/setter automatically translate objects to strings for storage
      set(x=null) { storage[key] = JSON.stringify(x); },
      get() { return JSON.parse(storage[key]||null); },
      enumerable: true
    })
  };

  // this creates a localStorage specifier shorthand...
  // Vue.storage.local = { ... }, where each key of the object is stored as a string in localStorage
  Object.defineProperty(store,'local',{
    // getter/setter automatically translate objects to/from strings for storage
    set(obj={}) {
      obj.mapByKey((v,k)=>{ 
        if (!(k in store)) define(store,localStorage||storage,k);
        if (v===undefined) return store.removeItem(k);
        store[k]=v; // save the value
      })
    },
    get() { return this.emulated() ? storage : store; },
    enumerable: true
  });

  // this creates a sessionStorage specifier shorthand similar to local...
  Object.defineProperty(store,'session',{
    // getter/setter automatically translate objects to/from strings for storage
    set(obj={}) {
      obj.mapByKey((v,k)=>{ 
        if (!(k in store)) define(store,sessionStorage||storage,k);
        if (v===undefined) return store.removeItem(k);
        store[k]=v; // save the value
      })
    },
    get() { return this.emulated() ? storage : store; },
    enumerable: true
  });

  // reports whether Storage is supported natively or not
  Object.defineProperty(store,'emulated',{
    value: ()=>typeof window.Storage===undefined,
    enumerable: false
  });
  
  // debug function to see inside store and emulated storage ...
  Object.defineProperty(store,'show',{
    value: ()=>({store: store, storage: storage}),
    enumerable: false
  });

  // remove item from storage...
  Object.defineProperty(store,'removeItem',{
    value (key) {
      if (this.emulated()) {
        delete storage[key];
      } else {
        localStorage.removeItem(key);     // since 'shared keys' could be in either location
        sessionStorage.removeItem(key);
      };
    },
    enumerable: true
  });
  
  // intialization: recover setters/getters for stored data...
  Object.keys(localStorage||[]).map(v=>define(store,localStorage,v));
  Object.keys(sessionStorage||[]).map(v=>define(store,sessionStorage,v));
  Vue.prototype.storage = store;  // attach store to Vue instance.
});


////////////////////////////////////////////////////////////
// Common Components
////////////////////////////////////////////////////////////

// automatically loads dependencies before generating contents...
Vue.component('auto-loader',{
  data: ()=>({ ready: false }),
  props: ['required', 'show'],
  methods: {
    done(x) { this.ready=x; this.$emit('ready',x); },
    load() { this.loader().then(this.done).catch(e=>console.error(e)); },
    loader: async function() {
      console.log('auto-loader:',this.required);
      if (this.$$app.lazy.files[this.required].loaded) return true; // previously loaded maybe by different instance
      // load could be single src or list of dependent sources; loads defines a list of file reference keys
      let loads = (this.$$app.lazy.files[this.required].sources||[this.required]).filter(s=>!this.$$app.lazy.files[s].loaded);
      let status = await Promise.all(loads.map(f=>{ // resolve unloaded dependencies
        switch (this.$$app.lazy.files[f].type) {
          case 'script': return this.loadScript(this.$$app.lazy.files[f].src);
          case 'stylesheet': return this.loadCSS(this.$$app.lazy.files[f].src);
          default: return false;
        };
      }));
      loads.map((f,i)=>{ this.$$app.lazy.files[f].loaded = status[i]; }); // update load status and run any callbacks
      for (let d of loads.map(f=>this.$$app.lazy.files[f].loaded && this.$$app.lazy.files[f].done).filter(Boolean))
        { await this.$$app.lazy[d] };
      let done = !this.$$app.lazy.files[this.required].loaded && this.$$app.lazy.files[this.required].done;
      if (status.every(Boolean)) {
        if (done)  await this.$$app.lazy[done](); 
        this.$$app.lazy.files[this.required].loaded = true;
        return true;
      } else {
        loads.filter(f=>!this.$$app.lazy.files[f].loaded).map(f=>console.warn(`Load failed: ${f}`));
        console.warn('autoload incomplete:',this.$$app.lazy.files);
        return false;
      };
    },
    loadCSS(link) {
      let elmt = document.createElement('link');
      let attrs = { rel: 'stylesheet', type: 'text/css', href: link };
      Object.keys(attrs).forEach(k=>elmt.setAttribute(k,attrs[k]));
      return new Promise((resolve,reject)=>{
        elmt.onload = evt => { resolve(true); };
        elmt.onerror = e => { console.error('loadCSS Error:', e); reject(e); };
        document.querySelector('head').appendChild(elmt);
      })
    },
    loadScript(script) {
      let elmt = document.createElement('script');
      return new Promise((resolve,reject)=>{
        elmt.onload = evt => { resolve(true); };
        elmt.onerror = e => { console.error('loadScript Error:', e); reject(e); };
        elmt.src = script;
        document.querySelector('head').appendChild(elmt);
      })
    },
  },
  watch: {
    show() { if (this.show&&!this.ready) this.load(); }
  },
  template: `
    <div v-show="show">
      <slot v-if="ready">Content Goes Here!</slot>
      <span v-if="!ready">Autoloading, please wait...</span>
    </div>`
});


// expandable block wrapper component...
Vue.component('blk-x',{
  data() { return {expanded: false, opened: false}; },  // opened fired on first expand
  props: ['hdr', 'inhibit', 'init', 'menu'],
  created() { 
    if (!this.init) return; this.expanded = true; this.opened = true; 
  },
  computed: {
    expandIcon() { return this.inhibit ? 'ico-star-empty' : this.expanded ? 'expand_less' : 'expand_more'; },
    menuIcons() { return this.menu || [] }
  },
  methods: {
    expand(state) { 
      if (this.inhibit) return; 
      this.expanded = typeof state==='boolean' ? state : !this.expanded; 
      if (!this.opened && this.expanded) { this.opened = true; this.$emit('load'); };
    },
  },
  template: `
  <div class="blk-x">
    <div class="blk-x-hdr" @click.stop="expand"><i v-icon:[expandIcon]></i>{{hdr}}
      <i v-for="i of menuIcons" class="blk-x-menu-ico right" v-icon:[i.icon] @click.stop=$emit(i.emit)></i>
    </div>
    <div class="blk-x-slot" v-if-class:none="!expanded"><slot></slot></div>
  </div>`
});


// component to add a floating element over window
Vue.component('floater',{
  data: ()=>({}),
  props: ['close','title'],
  mounted() {
    function dragElement(el,anchor) {
      function dragStart(e) {
        e = e || window.event;
        e.preventDefault();
        ({ clientX:x, clientY:y } = e);                 // get the mouse cursor position at startup:
        if (adjX===undefined)
          ([ adjX, adjY ] = [ el.offsetLeft-el.parentElement.offsetLeft, el.offsetTop-el.parentElement.offsetTop ]);
        document.onmouseup = dragEnd;
        document.onmousemove = dragMe;                  // call a function whenever the cursor moves:
      }
      function dragMe(e) {
        e = e || window.event;
        e.preventDefault();
        let { clientX:newX, clientY:newY } = e;         // new cursor location
        let { offsetLeft:left, offsetTop:top } = el;    // last element position
        [ x, y, dx, dy ] = [ newX, newY, newX-x, newY-y ];  // update position
        el.style.left = (left-adjX + dx) + "px";        // set the element's new position:
        el.style.top = (top-adjY + dy) + "px";
      }
      function dragEnd() {                              // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
      }
      var [ x, y, dx, dy, adjX, adjY ] = [ 0, 0, 0, 0 ];  // adjX,adjY account for margin offset defined after el placement
      (anchor||el).onmousedown = dragStart;
    };
    dragElement(this.$refs['flt'],this.$refs['fltHdr']);
  },
  template: `
    <div ref="flt">
      <div class="floater-hdr move" ref="fltHdr">
      <i v-show="close" class="right" v-icon:close @click="$emit('close')"></i>
      <i class="left move" v-icon:open_with></i>
      <span>{{title}}</span>
      </div>
      <div>
      <slot>Content Goes Here!</slot>
      </div>
    </div>`
});


// page layout sections...
Vue.component('generic',{
  props: ['page',"show", "user"],
  template: `<div v-html="page.content||'Loading (Generic), please wait...'" v-show="show"></div>`
});
