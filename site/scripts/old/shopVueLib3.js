// shopping application specific dialogs and customization library for Vue...

//import vueLib from './VueLib3.js';
//import vueSiteLib from './siteVueLib3.js';
//import helpers from './ClientLib.js';
import siteLib from './siteVueLib3.js';
const SITE = siteLib.config.SITE;
//const { jsonCopy, newType, scanForMatchTo, verifyThat } = helpers;
const { scanForMatchTo } = helpers;

// singular location for all shared shop app data, referenced as this.SHOP...
const SHOP_DATA = {
    grouping: [['All Units', 'all'],['Apartments','apts'], ['Offices','offices'], ['Inventory','stock']],
    inventory: [['Inventory','IV']],
    stock: { IV: [['Main Stock', '$1']] },
    units: { by:{}, keys:{} }
};
SHOP_DATA.sets = SITE.locations.concat(SHOP_DATA.inventory);
SHOP_DATA.setLabelByTag = SHOP_DATA.sets.reduce((obj,set)=>{obj[set[1]]=set[0]; return obj;},{});
for (let type of ['apts','offices','stock']) {
    let data = SITE[type] || SHOP_DATA.stock;
    for (let set of Object.keys(data)) {
        SHOP_DATA.units.by[set] = SHOP_DATA.units.by[set] || {};
        SHOP_DATA.units.keys[set] = SHOP_DATA.units.keys[set] || [];
        for (let u of data[set]) {
            SHOP_DATA.units.by[set][u[1]] = { unit: { tag: u[1], label: u[0] }, set: { tag: set, label: SHOP_DATA.setLabelByTag[set] }, type: type };
            SHOP_DATA.units.keys[set].push(u[1]);
        }
    }
};
console.log('SHOP_DATA',JSON.stringify(SHOP_DATA.units));

const shopLib = {

    config: {
        SHOP: SHOP_DATA,
        friendlyDate: (ds,frmt='iso',realm='',dflt='-?-') => { let d=new Date(ds); return d!='Invalid Date' ? d.style(frmt,realm) : dflt; },
        as$: (c) => '$' + Number(c).toFixed(2)
    },

    components: {

        'shop-pic-popup': {
            props: ['item'],
            template: `
                <div class="shop-pic-popup">
                    <i v-icon:cancel @click="$emit('hide')"></i>
                    <div class="shop-pic">
                        <img class="item-pic" :src="'/images/shopping/'+item.image" :alt="item.image" @click="$emit('hide')" />
                        <p>{{ item.item }}<br><span class="text-small">{{ item.desc }}</span></p>
                    </div>
                </div>`
                },
        'shopping-list-header' : {
            props: ['cart', 'cartOnly', 'group', 'setup', 'shopper'],
            data: function () { return {
                grp: this.group,
                grouping: [['All Units', 'all'],['Apartments','apts'], ['Offices','offices'], ['Inventory','stock']],
                showShoppingHelp: false
            }},
            methods: {
            },
            template:`
                <div class="shopping-list-header text-large">
                    <p class="text-center">Due Date: <span class="text-bold">{{ friendlyDate(setup.due,'XD XM D, YYYY','local') }}</span></p>
                    <p>List for <i v-show="shopper" class="text-accent icon-button" v-icon:chevron_left @click="$emit('unit','-1')"></i>
                        {{ SHOP.units[setup.set][cart.unit].set.label }} 
                        <i v-show="shopper" class="text-accent icon-button" v-icon:chevron_right @click="$emit('unit','+1')"></i>
                        at {{ SHOP.setLabelByTag[setup.set] }}
                        <i class="text-accent inline-icon" v-icon:help @click="showShoppingHelp=!showShoppingHelp"></i>
                    </p>
                    <p class="text-normal">Filter:
                        <label class="inline" v-for="g of SHOP.grouping"><input type="radio" name="shoppingListGrouping" :checked="g[1]===grp" 
                          :value="g[1]" v-model="grp" @change="$emit('group',grp)" />{{g[0]}}</label>
                    </p>
                    <p v-show="showShoppingHelp">HELP</p>
                    <toggle-button :init="cartOnly" :labels="'Show Cart Items Only,Show All Items'" @state="$emit('cart',$event)"></toggle-button>
                </div>`
        },
        'shopping-list-item': {
            props: ['item', 'only','scale', 'shopper'],
            data: ()=>({ showPic: false }),
            computed: {
                scaling() { return this.item.flag.includes('scale') ? this.scale : 1; }
            },
            template:`
                <div class="cart-grid" v-show="!only || item.quan">
                    <div class="cart-grid-col1">
                        <i class="text-accent left-icon" v-icon:remove @click="$emit('quan',item.index,-1,scaling)"></i>
                        <span class="item-quan">{{item.quan}}</span>
                        <i class="text-accent right-icon" v-icon:add @click="$emit('quan',item.index,1,scaling)"></i>
                    </div>
                    <div class="cart-grid-col2">
                        <i class="text-accent inline-icon shop-pic-icon" v-icon:image @click="showPic=true"></i>
                        <shop-pic-popup v-if="showPic" :item="item" @hide="showPic=false"></shop-pic-popup>
                    </div>
                    <div class="cart-grid-col3">
                        <p class="cart-line">
                             <span class="text-small cart-badge">{{item.id}}</span>
                             {{item.item}}<br>
                             <span class="text-small text-italic">{{item.desc}}, LIMIT: {{scaling*item.limit}}<br>
                                 <span v-if="shopper">LOT: {{item.lot}}, COST: {{as$(item.cost)}}<span v-if="item.note">, NOTE: {{ item.note }}</span></span>
                             </span>

                        </p>
                    </div>
                </div>`
        },
        'shopping-list': {
            props: ['cart', 'catalog', 'group', 'listing', 'setup', 'shopper'],
            data: function() { return {
                cartOnly: false
            }},
            computed: {
                permitted() { return !!this.listing.allowed.length; },
                list() {
                    // never allow unused items; always allow admin inventory; pass allowed categories; include specialized items
                    let allow = (i) => i.flag.includes('unused') ? false : this.listing.unit.startsWith('$') ? true : 
                        this.listing.allowed.includes(i.category) ? true : this.listing.special.includes(i.id);
                    let categories = this.catalog.categories.slice(0);
                    let groups = {}; categories.forEach(c=>groups[c]=[]);
                    for (let i of this.catalog.items) if (allow(i)) groups[i.category].push(i.index);
                    let cx = categories.filter(c=>groups[c].length);
                    let scaling = {}; categories.forEach(c=>scaling[c]=this.listing.scale[c]||1);
                    return { categories: cx, groups: groups, scaling: scaling };
                }
            },
            template: `
                <div id="shopping-list" class="shopping-list">
                    <div v-if="setup.id">
                    <shopping-list-header :cart="cart" :cartOnly="cartOnly" :group="group" :setup="setup" :shopper="shopper" 
                      @cart="(s)=>cartOnly=s" @group="(g)=>$emit('group',g)" @unit="chg=>$emit('active',chg)">
                      </shopping-list-header>
                    <p v-if="!permitted">NOT PERMITTED TO SHOP!</p>
                    <span v-if="permitted">
                        <blk-x v-for="c in list.categories" :hdr="c" :init="true">
                            <shopping-list-item v-for="i in list.groups[c]" :item="catalog.items[i]" :only="cartOnly" :scale="list.scaling[c]" 
                              :shopper="shopper" @quan="(idx,chg,scale)=>$emit('quan',idx,chg,scale)"></shopping-list-item>
                        </blk-x>
                        <blk-x hdr="Order Notes..." :init="true">
                            <textarea class="cart-notes" placeholder="List special requests here..." v-model="cart.notes"></textarea>
                        </blk-x>
                        <p>Total Cart Value: {{as$(cart.cost)}}</p>
                        <p><button type="button" @click="$emit('save')">Save Cart</button><br>
                        Last saved: {{ friendlyDate(cart.saved,'XD XM D Y" @ "hh:mm:ss','local','NEVER') }} by {{cart.by||'-?-'}}</p>
                    </span>
                    </div>
                    <div v-else><p>NO Shopping session presently available...</p></div>
                </div>`
        },
        'shopping-setup': {
            props: ['catalog', 'listings','sid','setups'],
            data: function () { return {
                setup: this.setups.table[this.setups.table.map(s=>s.id).indexOf(this.sid)],  // setup data...
                index: this.setups.table.map(s=>s.id).indexOf(this.sid),    // setup index
                listing: this.listings.table[0],    // active listing
                set: this.listings.table[0].set,    // listing set
                tag: this.listings.table[0].unit,   // listing unit tag
                showSetupHelp: false,
                showUnitHelp: false
            }},
            computed: {
                active() { return this.sid===this.setup.id },
                categories() { return this.catalog.categories.slice(0); },
                special() { return this.catalog.items.filter(i=>i.flag.includes('special')); },
                today() { return new Date().style('YYYY-MM-DD','local'); },
                units() { return { by: SHOP.units[this.set].by, keys: SHOP.units[this.set].keys }; }
            },
            methods: {
                chgListing() {
                    this.listing = this.listings.table.filter(l=>l.set==this.set && l.unit==this.tag)[0] ||
                      { id: null, set: this.set, unit: this.tag, allowed: [], scale: {}, special: [] };
                },
                chgScale(category, x) { this.listing.scale[category] = (this.listing.scale[category] || 1) + x; },
                chgSet() { this.tag = this.units.keys[0]; this.chgListing(); },
                chgUnit(x) {
                    let u = this.units.keys;
                    this.tag = u[(u.indexOf(this.tag)+x+u.length)%u.length];
                    this.chgListing();
                },
                chgIdx(x) {
                    this.index = (x===-1) ? ((this.index===null) ? this.setups.table.length-1 : (this.index===0) ? 0 : this.index-1) :
                      (this.index===null || this.index===(this.setups.table.length-1)) ? null : this.index+1;
                    this.setup = this.index!==null ? this.setups.table[this.index] : 
                      { id: null, location: this.setup.location, due: this.today, dtd: this.today };
                    console.log('chgIdx:',x,this.index,this.setup);
                },
                save(s) { console.log(`save[${s}]`) }
            },
            watch: {
            },
            template: `
                <div id="shopping-setup" class="shopping-setup">
                    <div>
                    <h4>Shopping Setup...<i class="text-accent inline-icon" v-icon:help @click="showSetupHelp=!showSetupHelp"></i></h4>
                    <p v-show="showSetupHelp">HELP</p>
                    <button type="button" @click="chgIdx(-1)">Previous</button>
                    <button type="button" class="right" @click="chgIdx(1)">Next</button>
                    <div class="setup-grid">
                        <div class="setup-grid-col1">ID #:</div>
                        <div class="setup-grid-col2">{{setup.id||'NEW'}}<span v-if="active"> (ACTIVE)</span></div>
                        <div class="setup-grid-col1">Location:</div>
                        <div class="setup-grid-col2">
                            <label class="inline" v-for="lx of SITE.locations">
                              <input type="radio" name="setupLocation" :checked="lx[1]===setup.location" 
                              :value="lx[1]" v-model="setup.location" />{{lx[0]}}</label>
                        </div>
                        <div class="setup-grid-col1">Due Date:</div>
                        <div class="setup-grid-col2"><input type="date" v-model="setup.due"></div>
                        <div class="setup-grid-col1">Shopping:</div>
                        <div class="setup-grid-col2"><input type="date" v-model="setup.dtd"></div>
                    </div>
                    <button type="button" @click="$emit('active',setup)">Set As Active</button>
                    <button type="button" class="right" @click="$emit('setup',setup)">Save Setup</button>
                    </div>
                    <div>
                    <hr>
                    <h4>Per Unit Settings... <i class="text-accent inline-icon" v-icon:help @click="showUnitHelp=!showUnitHelp"></i></h4>
                    <p v-show="showUnitHelp">HELP</p>
                    <p>Unit Set: 
                        <label class="flex" v-for="sx of SHOP.sets"><input type="radio" name="listingSet" :checked="sx[1]===set" 
                            :value="sx[1]" v-model="set" @change="chgSet" />{{sx[0]}}</label>
                    </p>
                    <p>List for <i class="text-accent icon-button" v-icon:chevron_left @click="chgUnit(-1)"></i>
                        {{ " "+SHOP.units[set][tag].unit.label+" " }}
                        <i class="text-accent icon-button" v-icon:chevron_right @click="chgUnit(1)"></i> (#{{listing.id||'NEW'}}) 
                    </p>

                    <h5>Categories</h5>
                    <div class="text-indent" v-for="c of categories">
                        <i class="text-accent icon-button" v-icon:remove @click="chgScale(c,-1)"></i> {{listing.scale[c]||1}} 
                        <i class="text-accent icon-button" v-icon:add @click="chgScale(c,1)"></i>
                        <label class="inline"><input type="checkbox" name="listingAllowed" :value="c" v-model="listing.allowed" /> {{c}}</label><br>
                    </div>

                    <h5>Specialty Items</h5>
                    <div class="text-indent" v-for="s of special">
                        <label class="setting-special-item"><input type="checkbox" name="listingSpecial" :value="s.id" v-model="listing.special" />
                        {{s.item}} #{{s.id}}<br><span class="setting-special-desc">{{s.desc}}</span></label><br>
                    </div>
                    <button type="button" class="right" @click="$emit('listing',listing)">Save Listing</button>
                    </div>
                </div>`
        },




        'shopping-unit-lists': {
            props: [],
            data: ()=>({}),
            computed: {
            },
            methods: {
            },
            template: `
                <div id="shopping-unit-lists" class="shopping-unit-lists">UNIT LISTS</div>`
        },
        'shopping-suppliers': {
            props: ['catalog'],
            data: ()=>({}),
            computed: {
            },
            methods: {
            },
            template: `
                <div id="shopping-suppliers" class="shopping-suppliers">SUPPLIERS</div>`
        },
        'shopping-notes': {
            props: [],
            data: ()=>({}),
            computed: {
            },
            methods: {
            },
            template: `
                <div id="shopping-notes" class="shopping-notes">NOTES</div>`
        },
        'shopping-notify': {
            props: [],
            data: ()=>({}),
            computed: {
            },
            methods: {
            },
            template: `
                <div id="shopping-notify" class="shopping-notify">NOTIFY</div>`
        },
        'shopping-catalog': {
            props: [],
            data: ()=>({}),
            computed: {
            },
            methods: {
            },
            template: `
                <div id="shopping-catalog" class="shopping-catalog">CATALOG</div>`
        },
        'shopping-download': {
            props: [],
            data: ()=>({}),
            computed: {
            },
            methods: {
            },
            template: `
                <div id="shopping-download" class="shopping-download">DOWNLOAD</div>`
        }
    }

}

export default shopLib;
