// Vue and site specific libraries for model...
import helpers from './ClientLib.js';
import vueLib from './VueLib3.js';
import siteLib from './siteVueLib3.js';
import shopLib from './shopVueLib3.js';
const { distinct } = helpers;

// catalog sort methods...
//function byItem(a,b) { return (a.item>b.item) ? 1 : ((a.item<b.item) ? -1 : 0) };
//function byCategory(a,b) { return (a.category>b.category) ? 1 : ((a.category<b.category) ? -1 : byItem(a,b)) };
//function byID(a,b) { return a.id>b.id ? 1 : -1 };
//function byReverseID(a,b) { return a.id>b.id ? -1 : 1 };
function orderBy(keys,invert=false) {   // closure
        let test = (x,y,kk) => x[kk[0]]>y[kk[0]] ? 1 : x[kk[0]]<y[kk[0]] ? -1 : (kk.length>1 ? test(x,y,kk.slice(1)): 0);
        return (a,b) => invert ? test(b,a,keys) : test(a,b,keys);
        };
    
// define a single shopping app...
const shop = Vue.createApp({
    data: function() { return {
        catalog: { categories: [], fields: [], items: [], raw: [], suppliers: [], loaded: false },
        dialog: '',
        grouping: 'all',
        listing: { active: { allowed: [], scale: {}, special: [] }, fields: [], loaded: false },
        listings: { fields: [], by: {}, raw: [], table: [], loaded: false },
        location: { label: 'Fox Ridge', tag: 'FR' },
        menu: {
            saranam: {label:'Saranam Home'}
        },
        setup: { active: {}, fields: [], loaded: false },
        setups: {fields: [], table: [], loaded: false },
        cart: { active: { items: [], notes:'' }, fields: [], loaded: false },
        carts: { inventory: [], fields: [], raw: [], table: [], loaded: false },
        showHelp: false,
        tmp: 'UND',
        user: { member: '' },
        unit: { label: 'Main Stock', tag: '$1' },
        view: 'cart'
    }},
    computed: {
        permissions() { return this.user.member.split(',') },
        admin() { return this.permissions.includes('admin') },
        stock() { return this.unit.tag.startsWith('$'); },
        locations() { return [this.SITE.inventory].concat(this.SITE.locations); },
        manager() { return this.permissions.includes('mamager') || this.admin },
        ready() { return {
            cart: this.catalog.loaded && this.listing.loaded && this.setup.loaded,
            setup: this.catalog.loaded && this.listings.loaded && this.setup.loaded && this.setups.loaded,
        }},
        ssn() { return this.permissions.includes('ssn') || this.manager },
        shopper() { return this.permissions.includes('shopper') || this.ssn },
        shopping() { return this.permissions.includes('shop') || this.shopper },
        noSetup() { return !this.setup.active.id },
        units() {
            let u = [];
            if (['all','units'].includes(this.grouping)) u = u.concat(this.SITE.units[this.location.tag]);
            if (['all','offices'].includes(this.grouping)) u = u.concat(this.SITE.offices[this.location.tag]);
            if (['all','stock'].includes(this.grouping)) u = u.concat(this.SITE.stock['IV']);
            return u;
        }
    },
    methods: {
        chgCart() {
            let ci = this.cart.active.items || [];
            let id = ci.map(i=>i[0]);
            let quan = ci.map(i=>i[1]);
            let cost = 0.00;
            for (let item of this.catalog.items) {
                item.quan = quan[id.indexOf(item.id)] || 0;    //update quantities
                if (item.quan) cost += item.quan * (item.cost||0)/(item.lot||1);
            };
            this.cart.active.cost = cost;
        },
        chgGrouping(g) {
            this.grouping = g;
            this.chgUnit();
        },
        chgLocation(tag) {
            let location = this.locations.filter(l=>l.includes(tag))[0];
            this.location = location ? {tag: location[1], label: location[0]} : this.location;
        },
        chgQuantity(idx,chg,scale) {
            let { quan, limit, lot, cost } = this.catalog.items[idx];
            this.catalog.items[idx].quan = ((chg===-1) && (quan>0)) ? quan-1 : ((chg===1)&& (this.shopper || (quan<(limit*scale)))) ? quan+1 : quan;
            if (this.catalog.items[idx].quan!==quan) this.cart.active.cost += chg * (cost||0)/(lot||1); 
            console.log('chgQuantity:',idx,chg, quan, limit, limit*scale,this.catalog.items[idx].quan, this.cart.active.cost)
        },
        chgSetup(setup) {   // only occurs when shopper+ changes setup!
            console.log('chgSetup:',setup);
            this.setup.active = setup;
            this.chgLocation(setup.location);
            this.chgUnit()
            this.loadCarts();
        },
        chgUnit(x) {
            console.log('chgUnit:',x);
            // units: array of arrays of including (as selected) inventory, units for location, and office locations... 
            let uv = this.units.map(u=>u[1]===undefined?u[0]:u[1]);  // unit values only
            let u = this.unit.tag;
            if (x==='+1'||x==='-1'){
                let original = u;   // to stop infinite loops!
                let ok = u => !!(u==original || (this.listings.by[this.location.tag][u]||{allowed:[]}).allowed.length)
                do { u=uv[(uv.indexOf(u)+Number(x)+uv.length)%uv.length]; console.log('next unit:',u) } while (!ok(u));
            } else {
                u = uv.includes(x) ? x : uv[0];
            };
            let unit = this.units[uv.indexOf(u)];
            this.unit = {tag: unit[1]===undefined ? unit[0] : unit[1], label: unit[0] };
            this.loadListing();
        },
        init(x) { 
            console.log(`init: ${x}`)
            //console.log('this.SITE',this.SITE);
            //console.log('this.SHOP',this.SHOP);
            //console.log('this.SITE',JSON.parse(JSON.stringify(this.SITE))); 
        },
        loadCart() {
            function prepCart(c) {
                let fields = c[0];
                let cc = c[1] || [];
                let cart = { id: null, items: [], notes: '' };  // required new cart defaults
                fields.map((f,i)=>cart[f]=cc[i]===undefined ? cart[f] : cc[i]);
                cart.notes = cart.notes.replace(/\|/g,'\n');
                return { fields: fields, active: cart, loaded: true };
            };
            let sID = this.setup.active.id;
            let { location, unit, tag } = this.user.other||{};
            if (!sID || !this.shopping || !location || !unit || tag===undefined) return;
            this.fetchJSON('GET',`/$cart/${sID}/${location}/${unit}/${tag}`,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let c = res.jxOK&&!res.jx.error ? res.jx : []; this.cart = prepCart(c); })
                .then(x=>{ this.chgCart(); })
                .catch(e=>console.error("loadCart:",e));
        },
        loadCarts() {
            function prepCarts(cx) {
                let carts = { inventory: [], fields: cx[0], raw: cx.slice(1), table: [], loaded: true }
                for (let c of carts.raw) {
                    let cc = {};
                    carts.fields.map((f,i) => cc[f]=c[i]);
                    if (cc.location=='IV') { carts.inventory.push(cc); } else { carts.table.push(cc) };
                };
                return carts;
            };
            console.log('loadCarts:',this.setup.active.id)
            this.fetchJSON('GET','/$carts/'+this.setup.active.id,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let cc = res.jxOK&&!res.jx.error ? res.jx : [];  this.carts = prepCarts(cc); })
                .catch(e=>console.error("loadCarts:",e));
        },
        loadCatalog() {
            function prepCatalog(catalog) {
                let labels = catalog[0]||[];
                let [ supplier, category, item, note ] = ['supplier', 'category', 'item', 'note'].map(k=>labels.indexOf(k));
                let items = catalog.slice(1).sort(orderBy([category,item,note]));
                let categories = distinct(items.map(i=>i[category])).sort();
                let suppliers = distinct(items.map(i=>i[supplier])).sort();
                items = items.map((item,idx)=>{ let i={index:idx, quan:0}; labels.map((l,n)=>i[l]=item[n]); return i;});
                return { raw: catalog, fields: labels, items: items, categories: categories, suppliers: suppliers, loaded: true };
            };
            this.fetchJSON('GET','/$catalog',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let raw = res.jxOK&&!res.jx.error ? res.jx : []; this.catalog = prepCatalog(raw); })
                .catch(e=>console.error("loadCatalog:",e));
        },
        loadListing() {
            function prepListing(lx) {
                let a = { id: null, location: '', unit: '', allowed: [], scale: {}, special: [] };
                if (lx.length>1) lx[0].map((f,i)=>a[f]=lx[1][i]);
                return { active: a, fields: lx[0], loaded: true };
            };
            let location = this.isStock ? 'IV' : this.location.tag;
            if (this.listings.loaded) {
                this.listing.active = this.listings.by[location][this.unit.tag] || this.listing.active;
                if (!this.listing.fields.length) this.listing.fields = this.listings.fields;
                return;
            };
            this.fetchJSON('GET',`/$listing/${location}/${this.unit.tag}`,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let lx = res.jxOK&&!res.jx.error ? res.jx : []; this.listing = prepListing(lx); })
                .catch(e=>console.error("loadListing:",e));
        },
        loadListings() {
            function prepListings(lx) {
                let listings = {fields: lx[0], by: {}, raw: lx.slice(1), table: [], loaded: true };
                for (let l of listings.raw) {
                    let ll={ allowed: [], special: [] };
                    listings.fields.map((f,i)=>ll[f]=l[i]);
                    listings.table.push(ll);
                    let {location, unit} = ll;
                    listings.by[location] = listings.by[location] || {};
                    listings.by[location][unit] = ll;
                };
                return listings;
            };
            this.fetchJSON('GET',`/$listings`,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let lx = res.jxOK&&!res.jx.error ? res.jx : []; this.listings = prepListings(lx); })
                .catch(e=>console.error("loadListings:",e));
        },
        loadSetup() {
            function prepSetup(s) {
                let ss={};
                if (s.length>1) s[0].map((f,i)=>ss[f]=s[1][i]);
                return { active: ss, fields: s[0], loaded: true };
            };
            this.fetchJSON('GET','/$setup/'+this.location.tag,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let s = res.jxOK&&!res.jx.error ? res.jx : []; this.setup = prepSetup(s); })
                .then(x=>{ if (this.setup.active.id) this.loadCart(); })
                .then(x=>{ if (this.setup.active.id && this.shopper) this.loadCarts(); })
                .catch(e=>console.error("loadSetup:",e));
        },
        loadSetups() {
            function prepSetups(setups) {
                let sss = { fields: setups[0], table: [], loaded: true };
                for (let s of setups.slice(1)) {
                    let ss={}; 
                    sss.fields.map((f,i)=>ss[f]=s[i]); 
                    sss.table.push(ss);
                };
                let today = new Date().style('YYYY-MM-DD','local');
                return sss;
            };
            this.fetchJSON('GET','/$setups/6',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let s = res.jxOK&&!res.jx.error ? res.jx : []; this.setups = prepSetups(s); })
                .catch(e=>console.error("loadSetups:",e));
        },
        login(u,restored) { 
            if (u && u.username) {
                if (this.shopping) return;  // valid login already processed
                this.user = u;
                this.chgLocation(u.other.location);
                this.chgUnit(u.other.unit);
                if (this.shopping) {
                    this.loadCatalog();
                    this.loadSetup();
                };
                if (this.admin) {
                    this.loadSetups();
                    this.loadListings();
                };
                // if not restored, force a window render???
            } else {
                this.user = {member:''};
            };
        },
        pick(src,x) {
            console.log(`pick[${src}]: ${x}`);
            if (src=='menu') this.dialog='';
            if (src==='icon') this.view = x;
        },
        popup(ref) { this.dialog = this.dialog!==ref ? ref : ''; },
        saveCart() {
            let list = this.catalog.items.filter(i=>i.quan);
            console.log('list:',list)
            let record = { id: this.cart.active.id || null, setup: this.setup.active.id, location: this.location.tag,
                unit: this.unit.tag, tag: this.user.other.tag, saved: new Date().style('iso'), by: this.user.username,
                items: list.map(i=>[i.id,i.quan]), notes: this.cart.active.notes.replace(/\n/g,'|'), 
                cost: list.map(i=>i.quan*((i.cost||0)/(i.lot||1))).reduce((a,c)=>a+c,0).toFixed(2)};
            let data = [ { ref: record.id, record: this.cart.fields.map(f=>record[f]) } ];
            console.log('record:',record)
            this.cart.active = record;
            console.log('cartSave:',data )
            this.fetchJSON('POST','/$cart',{body: data, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let action = res.jxOK&&!res.jx.error ? res.jx : []; console.log('cartSave:',action); })
                .catch(e=>console.error("saveCart:",e));
        },
        saveListing(listing) {
            let data = [{ ref: listing.id, record: this.listing.fields.map(f=>listing[f]) }];
            this.fetchJSON('POST','/$listing',{body: data, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let action = res.jxOK&&!res.jx.error ? res.jx : []; console.log('setupSave:',action); })
                .then(x=>{ this.loadListings(); })
                .catch(e=>console.error("saveListing:",e));
        },
        saveSetup(setup) {
            let data = [{ ref: setup.id, record: this.setup.fields.map(f=>setup[f]) }];
            this.fetchJSON('POST','/$setup',{body: data, headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ let action = res.jxOK&&!res.jx.error ? res.jx : []; console.log('setupSave:',action); })
                .then(x=>{ this.loadSetups(); })
                .catch(e=>console.error("saveCart:",e));
        }
    },
    mounted() {
        this.init('ready');
    },
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
