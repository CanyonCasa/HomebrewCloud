// Vue and site specific libraries for model...
import helpers from './ClientLib.js';
import vueLib from './VueLib3.js';
import siteLib from './siteVueLib3.js';
import shopLib from './shopVueLib3.js';
const { distinct } = helpers;

// catalog sort methods...
function orderBy(keys,invert=false) {   // closure
        let test = (x,y,kk) => x[kk[0]]>y[kk[0]] ? 1 : x[kk[0]]<y[kk[0]] ? -1 : (kk.length>1 ? test(x,y,kk.slice(1)): 0);
        return (a,b) => invert ? test(b,a,keys) : test(a,b,keys);
        };
const defaults = {
    cart: { active: { id:null, items: [], notes:'', unit: '' }, fields: [], loaded: false },
    listing: { active: { id: null, set:'', unit: '', allowed: [], scale: {}, special: [] }, fields: [], loaded: false },
    setup: { active: { id:0, location: 'FR', stock: ['$1']}, fields: [], loaded: false }
};

// define a single shopping app...
const shop = Vue.createApp({
    data: function() { return {
        cart: {}.mergekeys(defaults.cart),
        carts: { completed: false, fields: [], raw: [], table: [], loaded: false },
        catalog: { categories: [], fields: [], items: [], raw: [], suppliers: [], loaded: false },
        contacts: { loaded: false, names: {}, raw: {}, usernames: [], usernamesOrderedByName: [] },
        dialog: '',
        group: 'all',
        listing: {}.mergekeys(defaults.listing),
        listings: { fields: [], by: {}, permitted: {}, raw: [], table: [], loaded: false },
        menu: {
            saranam: {label:'Saranam Home', href: 'https://saranamabq.org', target:'_newtab'}
        },
        setup: {}.mergekeys(defaults.setup),
        setups: {fields: [], table: [], loaded: false },
        showHelp: false,
        user: { member: '' },
        view: 'cart',
        xblk: 'all'
    }},
    computed: {
        permissions() { return this.user.member.split(',') },
        admin() { return this.permissions.includes('admin') },
        manager() { return this.permissions.includes('mamager') || this.admin },
        ready() { return {
            cart: this.catalog.loaded && this.listing.loaded && this.cart.loaded && this.setup.loaded &&
              (!this.shopper || (this.shopper && ( this.listings.loaded && this.carts.loaded))),
            catalog: this.catalog.loaded,
            cloud: this.catalog.loaded && this.carts.loaded,
            lists: this.setup.loaded && this.catalog.loaded && this.carts.loaded,
            setup: this.catalog.loaded && this.listings.loaded && (this.setup.loaded && this.setups.loaded),
            status: this.carts.loaded && this.contacts.loaded
        }},
        ssn() { return this.permissions.includes('ssn') || this.manager },
        shopper() { return this.permissions.includes('shopper') || this.ssn },
        shopping() { return this.permissions.includes('shop') || this.shopper },
        noSetup() { return !this.setup.active.id },
        unitsInfo() {   // all possible units (info) filtered by stock, location, and grouping
            let inventory = this.SHOP.unitsInfo.by['IV'].filterByKey((u,k)=>this.setup.active.stock.includes(k))
            let info = {}.mergekeys(this.SHOP.unitsInfo.by[this.setup.active.location]).mergekeys(inventory);
            if (this.group!=='all') info = info.filterByKey(v=>v.type===this.group);
            let keys = this.SHOP.unitsInfo.keys[this.setup.active.location].slice(0).concat(Object.keys(inventory)).filter(k=>info[k]);
            console.log('unitsInfo:',{ by: info, keys: keys })
            return { by: info, count: keys.length, keys: keys };
        },
        unitsAllowed() { return this.unitsInfo.keys.filter(u=>this.listings.permitted[this.unitsInfo.by[u].set.tag]?.includes(u)) },
        unitsCompleted() { let ccu=this.carts.table.map(c=>c.unit); return this.unitsInfo.keys.filter(u=>ccu.includes(u)); },
        unitsCounts() { return [this.unitsCompleted.length,this.unitsAllowed.length]; },
   },
    methods: {
        chgActiveCart(chg) {
            console.log('chgActiveCart:', chg, this.carts.completed,this.unitsCompleted.length,this.unitsAllowed.length )
            let units = this.carts.completed ? this.unitsCompleted : this.unitsAllowed;
            if (units.length===0) return;
            let mod = units.length;
            let index = units.indexOf(this.cart.active.unit);
            index = (index===-1) ? 0 : (index+chg+mod)%mod;
            let tag = units[index];
            let info = this.unitsInfo.by[tag];
            let listing = this.listings.table.filter(l=>l.unit==tag && l.set===info.set.tag)[0]
            this.listing.active = listing || ({}.mergekeys(defaults.listing.active));
            let cart = this.carts.table.filter(c=>c.unit===tag)[0];
            this.cart.active = cart || ({}.mergekeys(defaults.cart.active)
                .mergekeys({set:this.setup.active.location, unit: tag, setup: this.setup.active.id}));
            this.chgActiveQuanties();
        },
        chgActiveQuanties() {
            let [ids,quans] = this.cart.active.items.reduce((r,i)=>{r[0].push(i[0]);r[1].push(i[1]);return r},[[],[]]);
            this.catalog.items.forEach((item,index,items)=>{items[index].quan = ids.includes(item.id) ? quans[ids.indexOf(item.id)] : 0});
        },
        chgCarts() {
            let { id, location, stock } = this.setup.active;
            this.carts.setup = {id: id, location: location, stock: stock };
            this.carts.table = this.carts.all.filter(c=>(c.setup===id&&c.set===location) || stock.includes(c.unit))
            this.chgActiveCart(0);
        },
        chgActiveSetup(setup) {   // only occurs when shopper+ changes setup!
            this.setup.active = setup;
            this.chgCarts();
        },
        chgGroup(g) {
            this.group = g;
            this.chgActiveCart(0);
        },
        chgQuantity(idx,chg,scale) {
            let { quan, limit, lot, cost } = this.catalog.items[idx];
            this.catalog.items[idx].quan += ((chg===-1) && (quan>0)) ? -1 : ((chg===1) && (this.shopper || (quan<(limit*scale)))) ? +1 : 0;
            this.cart.active.cost = this.catalog.items.filter(i=>i.quan).reduce((total,item)=> 
                Number((total + item.quan*(item.cost||0)/(item.lot||1)).toFixed(2)),0);
            console.log('chgQuantity:',idx,chg, quan, limit, limit*scale,this.catalog.items[idx].quan, this.cart.active.cost)
        },
        init(x) { 
            console.log(`init: ${x}`)
        },
        loadCart() {
            function prepCart(c) {
                let fields = c[0];
                let cc = c[1] || [];
                let cart = { id: null, set: location, unit: unit, items: [], notes: '' };  // required new cart defaults
                fields.map((f,i)=>cart[f]=cc[i]===undefined ? cart[f] : cc[i]);
                cart.notes = cart.notes.replace(/\|/g,'\n');
                return { fields: fields, active: cart, loaded: true };
            };
            let sID = this.setup.active.id;
            let { location, unit } = this.user.other;
            if (!sID || !this.shopping || !location || !unit) return;
            this.fetchJSON('GET',`/$cart/${sID}/${location}/${unit}`,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let c = res.jxOK&&!res.jx.error ? res.jx : []; this.cart = prepCart(c); this.chgActiveQuanties(); })
                .catch(e=>console.error("loadCart:",e));
        },
        loadCarts() {
            function prepCarts(cx) {
                let carts = { all: [], completed: true, fields: cx[0], raw: cx,
                    setup: {id: id, location: location, stock: stock}, table: [], loaded: true }
                for (let c of cx.slice(1)) {
                    let cc = {};
                    carts.fields.map((f,i) => cc[f]=c[i]);
                    carts.all.push(cc);
                    if (cc.setup===carts.setup.id || (cc.setup==0&&stock&&stock.includes(cc.unit))) carts.table.push(cc);
                };
                return carts;
            };
            let {id, location, stock} = this.setup.active;
            this.fetchJSON('GET','/$carts',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let cc = res.jxOK&&!res.jx.error ? res.jx : [];  this.carts = prepCarts(cc); })
                .catch(e=>console.error("loadCarts:",e));
        },
        loadCatalog() {
            function prepCatalog(c) {
                let catalog = { raw: c.slice(0), fields: c[0], items: [], categories: [], suppliers: [], loaded: true };
                let [ supplier, category, item, note ] = ['supplier', 'category', 'item', 'note'].map(k=>catalog.fields.indexOf(k));
                let items = c.slice(1).sort(orderBy([category,item,note]));
                catalog.categories = distinct(items.map(i=>i[category])).sort();
                catalog.suppliers = distinct(items.map(i=>i[supplier])).sort();
                catalog.items = items.map((item,idx)=>{ let i={chgd:false,index:idx,quan:0}; catalog.fields.map((f,n)=>i[f]=item[n]); return i;});
                return catalog;
            };
            return this.fetchJSON('GET','/$catalog',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let raw = res.jxOK&&!res.jx.error ? res.jx : []; this.catalog = prepCatalog(raw); return; })
                .catch(e=>console.error("loadCatalog:",e));
        },
        loadContacts() {
            function prepContacts(contacts) {
                let cx = { loaded: true, names: {}, raw: contacts, usernames: Object.keys(contacts), usernamesOrderedByName: [] };
                cx.names = contacts.mapByKey(c=>[c.fullname.split(/ (?=[^ ]+$)/)].map(n=>n[1]+', '+n[0]));
                let sortByName = (a,b) => (cx.names[a] > cx.names[b]) ? 1 : (cx.names[a] < cx.names[b]) ? -1 : 0;
                cx.usernamesOrderedByName = cx.usernames.slice(0).sort(sortByName);
                return cx;
            }
            this.fetchJSON('GET','/user/contacts/',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : {}; })
                .then(contacts=>{ this.contacts = prepContacts(contacts); })
                .catch(e=>console.error("loadContacts:",e));
        },
        loadListing() {
            function prepListing(lx) {
                let lstng = {}.mergekeys(defaults.listing).mergekeys({active:{set:location,unit:unit},fields:lx[0], loaded: true});
                if (lx.length>1) lstng.fields.map((f,i)=>lstng.active[f]=lx[1][i]);
                return lstng;
            };
            let { location, unit } = this.user.other;
            this.fetchJSON('GET',`/$listing/${location}/${unit}`,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                .then(listing=>{ this.listing = prepListing(listing); })
                .catch(e=>console.error("loadListing:",e));
        },
        loadListings() {
            function prepListings(lx) {
                let listings = {fields: lx[0], permitted: {}, raw: lx, table: [], loaded: true };
                for (let [j,l] of Object.entries(lx.slice(1))) {
                    let ll = listings.fields.reduce((obj,f,i)=>{obj[f]=l[i]; return obj;},{});
                    listings.table.push(ll);
                    let {set, unit} = ll;
                    if (!listings.permitted[set]) listings.permitted[set] = []; 
                    if (ll.allowed.length) listings.permitted[set].push(unit);
                };
                return listings;
            };
            this.fetchJSON('GET',`/$listings`,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                .then(listings=>{ this.listings = prepListings(listings); })
                .catch(e=>console.error("loadListings:",e));
        },
        loadSetup() {
            function prepSetup(s) {
                let active = {}.mergekeys(defaults.setup.active).mergekeys({location: loc})
                if (s.length>1) s[0].map((f,i)=>active[f]=s[1][i]||'');
                return { active: active, fields: s[0], loaded: true };
            };
            let loc = this.user.other.location
            this.fetchJSON('GET','/$setup/'+loc,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let s = res.jxOK&&!res.jx.error ? res.jx : []; this.setup = prepSetup(s); })
                .then(x=>{ if (this.setup.active.id) this.loadCart(); })
                .then(x=>{ if (this.shopper) this.loadCarts(); })
                .catch(e=>console.error("loadSetup:",e));
        },
        loadSetups() {
            function prepSetups(setups) {
                let sss = { fields: setups[0], raw: setups, table: [], loaded: true };
                for (let s of setups.slice(1)) {
                    let ss={}; 
                    sss.fields.map((f,i)=>ss[f]=s[i]); 
                    sss.table.push(ss);
                };
                let today = new Date().style('YYYY-MM-DD','local');
                return sss;
            };
            this.fetchJSON('GET','/$setups/8',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let s = res.jxOK&&!res.jx.error ? res.jx : []; this.setups = prepSetups(s); })
                .catch(e=>console.error("loadSetups:",e));
        },
        login(u,restored) { 
            if (u && u.username) {
                if (this.shopping) return;  // valid login already processed
                this.user = u;
                if (this.shopping)
                    this.loadCatalog()
                        .then(x=>{ this.loadSetup(); this.loadListing(); })
                        .catch(e=>{console.error(e)});
                if (this.shopper) {
                    this.loadSetups();
                    this.loadListings();
                };
                if (this.ssn) this.loadContacts();
                // if not restored, force a window render???
            } else {
                this.user = {member:''};
            };
        },
        pick(src,x) {
            console.log(`pick[${src}]: ${x}`);
            if (src==='icon') this.view = x;
            if (src=='menu') {
                this.dialog='';
                if (this.menu[x]) {
                    let {href, target} = this.menu[x];
                    if (href) window.open(href,target||'_blank');
                };
            };
        },
        popup(ref) { this.dialog = this.dialog!==ref ? ref : ''; },
        replaceItem(item) { this.catalog.items[item.index] = item; },
        saveCatalog() {
            let chgdItems = this.catalog.items.filter(i=>i.chgd);
            console.log('save changed items:',chgdItems);
            let body = chgdItems.map(i=>({ref: i.id, record: this.catalog.fields.map(f=>i[f])}))
            console.log('save body:',body);
            this.fetchJSON('POST','/$catalog',{body: body, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let action = res.jxOK&&!res.jx.error ? res.jx : []; console.log('saveCatalog:',action); })
                .then(x=>this.loadCatalog())
                .catch(e=>console.error("saveCatalog:",e));
        },
        saveCart() {
            let list = this.catalog.items.filter(i=>i.quan);
            let record = { id: this.cart.active.id || null, setup: this.setup.active.id, set: this.listing.active.set,
                unit: this.listing.active.unit, saved: new Date().style('iso'), by: this.user.username,
                items: list.map(i=>[i.id,i.quan]), notes: this.cart.active.notes.replace(/\n/g,'|'),
                cost: Number(list.map(i=>i.quan*((i.cost||0)/(i.lot||1))).reduce((a,c)=>a+c,0).toFixed(2))};
            // force stocks to be first carts, id: 0-9, and setup 0
            if (record.unit.startsWith('$')) { record.id = +record.unit.slice(1); record.setup = 0; };
            let data = [ { ref: record.id, record: this.cart.fields.map(f=>record[f]) } ];
            this.cart.active = record;
            this.fetchJSON('POST','/$cart',{body: data, headers:{authorization: `Bearer ${this.user.token}`}})
            .then(res=>res.jxOK&&!res.jx.error ? res.jx : [])   // always returns an array
            .then(result=>result[0]||{})    // first array or empty object
            .then(result=>{ if (result.action==='added') this.cart.active.id=result.ref; return result; })
            .then(result=>{ console.log('cartSave:',result, this.cart.active.id); })
            .catch(e=>console.error("saveCart:",e));
        },
        saveFile(what,data) {
            let url = what==='catalog' ? '/$catalog' : what==='image' ? '/~pics' : null;
            if (!url) return console.warn(`saveFile: unknown source type... ${what}`);
            let body = what==='catalog' ? [ { ref: '$', record: data } ] : [ {name: img.saveAs, contents: img.contents, force: img.force} ];
            this.fetchJSON('POST',url,{body: body, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ console.log('saveFile:', res.jxOK&&!res.jx.error ? res.jx : []); })
                .catch(e=>console.error("saveFile:",e));
        },
        saveListings(listings) {
            let data = listings.map(lst=>({ ref: lst.id, record: this.listings.fields.map(f=>lst[f]) }));
            this.fetchJSON('POST','/$listing',{body: data, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let action = res.jxOK&&!res.jx.error ? res.jx : []; console.log('saveListings:',action); })
                .then(x=>{ this.loadListings(); })
                .catch(e=>console.error("saveListings:",e));
        },
        saveSetup(setup) {
console.log('setup:',setup)
            let data = [{ ref: setup.id, record: this.setup.fields.map(f=>setup[f]) }];
            this.fetchJSON('POST','/$setup',{body: data, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let action = res.jxOK&&!res.jx.error ? res.jx : []; console.log('setupSave:',action); })
                .then(x=>{ this.loadSetups(); })
                .catch(e=>console.error("saveSetup:",e));
        }
/*        },

        sendMail: async function(body) {
            return await this.fetchJSON('POST','/@mail',{body: body, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>res.jxOK&&!res.jx.error ? res.jx : null)
                .catch(e=>console.error("sendMail:",e));
        },
        sendText: async function(body) {
            return await this.fetchJSON('POST','/@text',{body: body, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>res.jxOK&&!res.jx.error ? res.jx : null)
                .catch(e=>console.error("sendText:",e));
        }
*/
    }
});

// merge all library elements...
const allLibs = {config: {}, components: {}, directives: {}, plugins: {}};  // defaults
['config', 'components', 'directives','plugins'].forEach(element=>{
    for (let [key,value] of Object.entries(vueLib[element]||{})) allLibs[element][key] = value;     // add in vueLib elements
    for (let [key,value] of Object.entries(siteLib[element]||{})) allLibs[element][key] = value;    // add or override with siteVueLib
    for (let [key,value] of Object.entries(shopLib[element]||{})) allLibs[element][key] = value;    // add or override with shopVueLib
});
// apply to app...
for (let [key,value] of Object.entries(allLibs.config||{})) shop.config.globalProperties[key] = value;
for (let [key,value] of Object.entries(allLibs.directives||{})) shop.directive(key,value);
for (let [key,value] of Object.entries(allLibs.components||{})) shop.component(key,value);
for (let [key,value] of Object.entries(allLibs.plugins||{})) shop.use(value);  // need to extend with options

shop.mount('#shop');                // mount app to its root component...

window.shop = shop;                 // expose to console

// wait to display page until all parts of rendering ready...
document.fonts.ready.then(x=>{document.getElementById('shop').style.visibility='visible'}).catch(e=>console.error(e));
