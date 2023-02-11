// Vue and site specific libraries for model...
import helpers from './ClientLib.js';
import vueLib from './vueLib3.js';
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
//    inject: ['app', 'site'],
    data: function() { return {
        catalog: [],
        catalogFields: [],
        catalogItems: [],
        categories: [],
        suppliers: [],
        dialog: '',
        location: {label:'', value:''},
        menu: {
            saranam: {label:'Saranam Home'}
        },
        setup: {},
        setupFields: [],
        setups: [],
        showHelp: false,
        user: {
            member: ''
        },
        unit: {label:'', value:''},
        units: [],
        view: 'cart'
    }},
    computed: {
        permissions() { return this.user.member.split(',') },
        admin() { return this.permissions.includes('admin') },
        manager() { return this.permissions.includes('mamager') || this.admin },
        ssn() { return this.permissions.includes('ssn') || this.manager },
        shopper() { return this.permissions.includes('shopper') || this.ssn },
        shopping() { return this.permissions.includes('shop') || this.shopper }
    },
    methods: {
        chgCart() {},
        chgLocation(x) {console.log('chgLocation:',x)},
        chgSetup(setup) {
            console.log('chgSetup:',setup);
            this.setup = setup;
            if (this.shopper) {
                this.loadCarts();
            } else {
                this.loadCart();
            }
        },
        chgUnit(x) {console.log('chgUnit:',x)},
        friendlyDate(ds,frmt='iso') {let d=new Date(ds); return d!='Invalid Date' ? d.style(frmt) : ''; },
        help() { this.showHelp = ! this.showHelp; },
        init(x) { 
            console.log(`init: ${x}`)
            console.log('this.fetchJSON',this.fetchJSON)
            console.log('this.storage',this.storage)
            console.log(this.site);
            
        },
        loadCart() {},
        loadCarts() {
            if (!this.setup.id || !this.shopper) return;
            this.fetchJSON('GET','/$carts/'+this.setup.id,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ this.prepCarts(res); })
                .catch(e=>console.error("loadCarts:",e));
        },
        loadCatalog() {
            this.fetchJSON('GET','/$catalog',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ this.catalog = res.jxOK&&!res.jx.error ? res.jx : []; return this.catalog; })
                .then(c=>{ this.prepCatalog(c); })
                .catch(e=>console.error("loadCatalog:",e));
        },
        loadSetup() {
            let location = this.location.value || this.user.other.location;
            this.fetchJSON('GET','/$setup/'+location,{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                .then(s=>{ let ss={}; if (s.length>1) s[0].map((f,i)=>ss[f]=s[1][i]); return ss; })
                .then(setup=> this.chgSetup(setup))
                .catch(e=>console.error("loadSetup:",e));
        },
        loadSetups() {
            this.fetchJSON('GET','/$setups',{headers:{authorization: `Bearer ${this.user.token}`}})
                .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                .then(setups=>{ return this.prepSetups(setups); })
                .catch(e=>console.error("loadSetup:",e));
        },
        login(u) { 
            if (u) {
                if (this.shopping) return;  // valid login already processed
                this.user = u;
                this.location = { value: u.other.location, label: this.site.locations.filter(l=>l.includes(u.other.location))[0][0] };
                this.unit = { value: u.other.unit, label: u.other.unit };
                if (this.shopping) {
                    this.loadCatalog();
                    this.loadSetup();
                };
                if (this.admin) this.loadSetups();
            } else {
                this.user = {member:''};
                this.catalog = [];
                this.catalogItems = [];
                this.location = {value: '', label: ''};
                this.unit = {value: '', label: ''};
            };
        },
        pick(src,x) {
            console.log(`pick[${src}]: ${x}`);
            if (src=='menu') this.dialog='';
            if (src==='icon') this.view = x;
        },
        popup(ref) { this.dialog = this.dialog!==ref ? ref : ''; },
        prepCarts() {},
        prepCatalog(catalog) {
            let labels = catalog[0];
            let [ supplier, category, desc, note ] = ['supplier', 'category', 'desc', 'note'].map(k=>labels.indexOf(k))
            this.catalogFields = labels;
            let items = catalog.slice(1).sort(orderBy([category,desc,note]));
            this.categories = distinct(items.map(i=>i[category])).sort();
            this.suppliers = distinct(items.map(i=>i[supplier])).sort();
            this.catalogItems = items.map((item,idx)=>{ let i={index:idx, quan:0}; labels.map((l,n)=>i[l]=item[n]); return i;})
        },
        prepSetups(setups) {
            let sss = [];
            let setupFields = setups[0];
            this.setupFields = setupFields;
            for (let s of setups.slice(1)) {
                let ss={}; 
                setupFields.map((f,i)=>ss[f]=s[i]); 
                sss.push(ss);
            };
            this.setups = sss;
        }
    },
    mounted() {
        this.init('ready');
    },
/*    watch: {
        shopping() {
            if (!this.shopping || this.catalog.length || !this.user.token) return;
            this.unit = this.user.other.unit;
            this.loadCatalog();
            this.loadSetup();
        }
    } */
});


const allLibs = {config: {}, components: {}, directives: {}, plugins: {}};  // defaults
['config', 'components', 'directives','plugins'].forEach(element=>{
    for (let [key,value] of Object.entries(vueLib[element]||{})) allLibs[element][key] = value;     // add in vueLib elements
    for (let [key,value] of Object.entries(siteLib[element]||{})) allLibs[element][key] = value;    // add or override with siteVueLib
    for (let [key,value] of Object.entries(shopLib[element]||{})) allLibs[element][key] = value;    // add or override with shopVueLib
});



for (let [key,value] of Object.entries(vlib.config||{})) shop.config.globalProperties[key] = value;
for (let [key,value] of Object.entries(vlib.directives||{})) shop.directive(key,value);
for (let [key,value] of Object.entries(vlib.components||{})) shop.component(key,value);
for (let [key,value] of Object.entries(vlib.plugins||{})) shop.use(value);  // need to extend with options

//Object.keys(vlib.config||{}).forEach(k=>{ shop.config.globalProperties[vlib.plugins[k]); });
//Object.keys(vlib.plugins||{}).forEach(k=>{ shop.use(vlib.plugins[k]); });
//Object.keys(vlib.directives||{}).forEach(k=>{ shop.directive(k,vlib.directives[k]); });
//Object.keys(vlib.components||{}).forEach(k=>{ shop.component(k,vlib.components[k]); });

shop.mount('#shop');                // mount app to its root component...

window.shop = shop;                 // expose to console
