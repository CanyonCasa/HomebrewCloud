// shopping application specific dialogs and customization library for Vue...

import helpers from './ClientLib.js';
import siteLib from './siteVueLib3.js';
const SITE = siteLib.config.SITE;
const { as$, asBytes, asByteStr, base64, csv2obj, obj2csv, pluralize } = helpers;

const shopLib = {
    config: {
        // singular location for all shared shop app data, referenced as this.SHOP...
        SHOP: (function() {
            const shop = {
            flags: ['admin','special','scale','unused'],
            grouping: [['All Units', 'all'],['Apartments','apts'], ['Offices','offices'], ['Inventory','stocks']],
            imageLimit: [200*1024,'200K'],
            inventory: [['Inventory','IV']],
            sets: SITE.locations,
            setsLabels: {},
            stocks: { IV: [['Main Stock', '$1'],['Aux Stock', '$2']] },
            unitsInfo: { by:{}, keys:{} }
            }
            shop.sets = shop.sets.concat(shop.inventory);
            shop.setsLabels = shop.sets.reduce((obj,set)=>{obj[set[1]]=set[0]; return obj;},{});
            for (let type of ['apts','offices','stocks']) {
                let data = SITE[type] || shop.stocks;
                for (let set of Object.keys(data)) {
                    shop.unitsInfo.by[set] = shop.unitsInfo.by[set] || {};
                    shop.unitsInfo.keys[set] = shop.unitsInfo.keys[set] || [];
                    for (let u of data[set]) {
                        shop.unitsInfo.by[set][u[1]] = { unit: { tag: u[1], label: u[0] }, set: { tag: set, label: shop.setsLabels[set] }, type: type };
                        shop.unitsInfo.keys[set].push(u[1]);
                    };
                };
            };
            return shop;
        })(),
        asBytes: asBytes,
        asByteStr: asByteStr,
        as$: as$,
        friendlyDate: (ds,frmt='XD XM D, YYYY',realm='local',dflt='-?-') => { let d=new Date(ds); return d!='Invalid Date' ? d.style(frmt,realm) : dflt; },
        pluralize: pluralize
    },

    components: {
        'shpg-catalog': {
            props: ['catalog'],
            data: function() { return {
                category: { add: false, value: '' },
                supplier: { add: false, value: '' },
                force: false,
                imgPreview: false,
                itemFilter: {
                    category: '',
                    chgd: false,
                    flags: [],
                    not: false,
                    supplier: '',
                    text: ''
                },
                fIdx: 0,
                imgRpt: { error: false, msg: '', details: '' },
                item: this.fixFlags(this.catalog.items[0]),     // note fixFlags makes a copy of catalog item
                original: this.fixFlags(this.catalog.items[0]), // untouched (read/only) copy of item
                searchText: ''
            }},
            computed: {
                chgdCount() { return this.catalog.items.filter(i=>i.chgd).length },
                filtering() { return this.filteredIndexes.length < this.catalog.items.length },
                filteredIndexes() {
                    let fltr = this.itemFilter;
                    if (fltr.chgd) return this.catalog.items.filter(i=>i.chgd).map(i=>i.index);
                    let filteredItems = fltr.category ? this.catalog.items.filter(i=>i.category===fltr.category) : this.catalog.items;
                    filteredItems = fltr.supplier ? filteredItems.filter(i=>i.supplier===fltr.supplier) : filteredItems;
                    filteredItems = fltr.flags.length ? filteredItems.filter(i=>fltr.not ? !fltr.flags.some(f=>i.flags.includes(f)) :
                        fltr.flags.every(f=>i.flags.includes(f))) : filteredItems;
                    let regex = fltr.text ? new RegExp(fltr.text,'i') : '';
                    filteredItems = fltr.text ? filteredItems.filter(i=>['item','desc','note'].some(f=>i[f].match(regex))) : filteredItems;
                    let ix = filteredItems.map(item=>item.index);
                    return ix;
                }
            },
            methods: {
                chgField(field) {
                    let opt = document.createElement("option");
                    opt.value = this[field].value;
                    opt.text = this[field].value;
                    this.$refs[field].add(opt,null);
                    this.$refs[field+'Filter'].add(opt,null);
                    this[field].add = false;
                    return this.field.value;
                },
                chgFltr() { this.chgIdx(0); },
                chgIdx(x) {
                    if (this.item.id===this.catalog.items[this.filteredIndexes[x]]?.id) return;
                    if (this.category.add && this.category.value) this.item.category = this.chgField('category');
                    if (this.supplier.add && this.supplier.value) this.item.supplier = this.chgField('supplier');
                    let equal = (f) => JSON.stringify(this.item[f])===JSON.stringify(this.original[f]);
                    this.item.chgd = this.item.chgd || this.catalog.fields.some(f=>!equal(f));
                    if (this.item.chgd) this.$emit('item',this.fixFlags(this.item));
                    // new fIdx...
                    this.fIdx = this.filteredIndexes.length===0 ? null :                    
                        (x==='previous') ? ((this.fIdx===null) ? this.filteredIndexes.length-1 : (this.fIdx===0) ? null : this.fIdx-1) :                
                        (x==='next') ? ((this.fIdx===null) ? 0 : (this.fIdx===(this.filteredIndexes.length-1)) ? null : this.fIdx+1) : x;
                    this.item = this.fIdx!==null ? this.fixFlags(this.catalog.items[this.filteredIndexes[this.fIdx]]) :
                      { id: null, category: this.catalog.categories[0], item: '', desc: '', note: '', image: '', limit: 1,
                        flags: [], supplier: this.catalog.suppliers[0], lot: 1, cost: 0.00, chgd: false, index: this.catalog.items.length };
                    this.original = {}.mergekeys(this.item);
                },
                chgNewCategory() { this.category.value = this.category.value.toUpperCase(); },
                chgSearchText(e) { if (!e) this.searchText=''; this.itemFilter.text = this.searchText; this.chgFltr(); },
                clearFilter() { this.itemFilter = { category: '', chgd: false, flags: [], not: false, supplier: '' }; this.chgSearchText() },
                fixFlags(item) { let flags = typeof item.flags==='string' ? item.flags.split(',').filter(f=>f) : item.flags.join(',');
                    return {}.mergekeys(item,['flags']).mergekeys({flags: flags}); },
                imgRead() { this.fileReadDialog('catalog-item-img','dataURL')
                    .then(i=>{ if (i) {i.warn=i.size>this.SHOP.imageLimit[0]; this.item.image=i.saveAs; this.item.img=i; }})
                    .catch(e=>console.error(e))},
                imgUpload() {
                    let body = [ {name: this.item.img.saveAs, contents: this.item.img.contents, force: this.force} ];
                    console.warn("body:",body);
                    this.fetchJSON('POST','/~pics',{body:body, headers:{authorization: `Bearer ${this.$root.user.token}`}})
                        .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                        .then(result=>{ this.imgRpt = result[0]; })
                        .catch(e=>console.error("imgUpload:",e));
                }
            },
            template: /*html*/`
                <div id="shpg-catalog" class="shpg-catalog">
                    <h4>Edit Catalog...</h4>
                    <h5>Item Selection Filtering: {{filteredIndexes.length}} {{ pluralize(filteredIndexes.length,'item')}} selected
                    <span v-show="filtering"><button type="button" class="right text-small" @click="clearFilter">CLEAR</button></span>
                    </h5>
                    <div class="catalog-grid no-border">
                        <div class="catalog-grid-c1">Select:</div>
                        <div class="catalog-grid-c2">
                            <label><input type="checkbox" v-model="itemFilter.chgd" @change="chgFltr" />Only Changed</label>
                        </div>
                        <div class="catalog-grid-c1">Category:</div>
                        <div class="catalog-grid-c2">
                            <select ref="categoryFilter" v-model=itemFilter.category @change="chgFltr">
                                <option value="" >- ANY -</option>
                                <option v-for="c in catalog.categories" :value="c">{{c}}</option>
                            </select>
                        </div>
                        <div class="catalog-grid-c1">Flags:<br>
                            <label><input type="checkbox" v-model="itemFilter.not" @change="chgFltr" />NOT</label>
                        </div>
                        <div class="catalog-grid-c2">
                            <label v-for="f in SHOP.flags">
                                <input type="checkbox" v-model=itemFilter.flags name="filterFlags" :value="f" @change="chgFltr"/>
                                {{f.toTitleCase()}}</label>
                        </div>
                        <div class="catalog-grid-c1">Supplier:</div>
                        <div class="catalog-grid-c2">
                            <select ref="supplierFilter" v-model=itemFilter.supplier @change="chgFltr">
                                <option value="" >- ANY -</option>
                                <option v-for="s in catalog.suppliers" :value="s">{{s}}</option>
                            </select>
                        </div>
                        <div class="catalog-grid-c1">Text:</div>
                        <div class="catalog-grid-c2">
                            <input type="text" v-debounce:1s.input="chgSearchText" v-model="searchText" @focus="$event.target.select()"
                                placeholder="Match item, description, or note by text..." />
                            <i v-icon:backspace class="text-icon" @click="chgSearchText()"></i>
                        </div>
                    </div>
                    <h5>Selected Item: <span v-show="item.chgd" class="text-bold">CHANGED</span></h5>
                    <div class="catalog-grid" v-if-class:text-alt="item.chgd">
                        <div class="catalog-grid-c1">ID# (index):</div>
                        <div class="catalog-grid-c2 justify-center">
                            <button class="left" type="button" @click="chgIdx('previous')">Previous</button>
                            {{ item.id || 'NEW' }} ({{item.index}})
                            <button class="right" type="button" @click="chgIdx('next')">Next</button>
                        </div>
                        <div class="catalog-grid-c1">Item:</div>
                        <div class="catalog-grid-c2 stretch">
                            <input class="fit" type="text" v-model="item.item" pattern="[^\\/\\\\<>]+" placeholder="Item name..." />
                        </div>
                        <div class="catalog-grid-c1">Category:</div>
                        <div class="catalog-grid-c2">
                            <select ref="category" v-show="!category.add" v-model=item.category>
                                <option v-for="c in catalog.categories" :value="c">{{c}}</option>
                            </select>
                            <input type="text" v-show="category.add" v-model="category.value" pattern="[A-Za-z]+" 
                                @input="chgNewCategory" placeholder="New category..." />
                            <i class="catalog-icon" v-icon="category.add?'do_not_disturb_on':'add_circle'" @click="()=>category.add=!category.add" ></i>
                        </div>
                        <div class="catalog-grid-c1">Description:</div>
                        <div class="catalog-grid-c2 stretch">
                            <input class="fit" type="text" v-model="item.desc" pattern="[^\\/\\\\<>]+" placeholder="Item description..." />
                        </div>
                        <div class="catalog-grid-c1">Note:</div>
                        <div class="catalog-grid-c2 stretch">
                            <input class="fit" type="text" v-model="item.note" pattern="[^\\/\\\\<>]+" placeholder="Shopping Note..." />
                        </div>
                        <div class="catalog-grid-c1">Supplier:</div>
                        <div class="catalog-grid-c2">
                            <select ref="supplier" v-show="!supplier.add" v-model=item.supplier>
                                <option v-for="s in catalog.suppliers" :value="s">{{s}}</option>
                            </select>
                            <input type="text" v-show="supplier.add" v-model="supplier.value" pattern="[A-Z a-z]+"
                                placeholder="New supplier..." />
                            <i class="catalog-icon" v-icon="supplier.add?'do_not_disturb_on':'add_circle'" @click="()=>supplier.add=!supplier.add" ></i>
                        </div>
                        <div class="catalog-grid-c1">Image:</div>
                        <div class="catalog-grid-c2">
                            <input type="text" v-model="item.image" placeholder="Item image filename..." />
                            <i class="catalog-icon" v-icon:image @click="imgRead"></i>
                            <input id="catalog-item-img" class="none" type="file" accept="image/*" />
                        </div>
                        <template v-if="item.img">
                        <div class="catalog-grid-c1"></div>
                        <div class="catalog-grid-c2">
                            <label><input type="checkbox" v-model="force" />Force</label>
                            <button type="button" @click="imgUpload">Upload Image</button>
                        </div>
                        <div class="catalog-grid-c1">Message:</div>
                        <div class="catalog-grid-c2 stretch text-alt text-bold">{{ imgRpt.msg }}</div>
                        <div class="catalog-grid-c1">Preview:</div>
                        <div class="catalog-grid-c2 stretch">
                            <p v-if="item.img.warn" class="text-alert">WARNING: Large file ({{SHOP.imageLimit[1]}}), please 
                                consider resizing smaller for faster loading!</p>
                            <img ref="itemImage" class="preview-img" :src="item.img.contents" />
                        </div>
                        </template>
                        <div class="catalog-grid-c1">Flags:</div>
                        <div class="catalog-grid-c2">
                            <label v-for="f in SHOP.flags"><input type="checkbox" v-model=item.flags name="itemFlags" :value="f" />
                                {{f.toTitleCase()}}</label>
                        </div>
                        <div class="catalog-grid-c1">Limit:</div>
                        <div class="catalog-grid-c2"><input class="text-right" type="number" v-model="item.limit" /></div>
                        <div class="catalog-grid-c1">Lot Size:</div>
                        <div class="catalog-grid-c2"><input class="text-right" type="number" v-model="item.lot" /></div>
                        <div class="catalog-grid-c1 stretch">Lot Cost:<span class="right">$</span></div>
                        <div class="catalog-grid-c2"><input class="text-right" type="text" v-model="item.cost" pattern="\d+.\d\d" /></div>
                    </div>
                    <p>{{ chgdCount }} {{pluralize(chgdCount,'item')}} of {{catalog.items.length }} items changed pending save</p>
                    <button class="right" @click="()=>$emit('save')">Save Calatog Changes</button>
                </div>`
        },
        'shpg-cloud': {
            props: ['carts','catalog'],
            data: ()=>({
                // downloads/uploads...
                format: 'csv',
                formats: [['CSV (Excel)','csv'],['JSON','json']],
                doc: { file: {}, force: false, rpt: {} },
                docs: [],
                // product image management...
                force: false,
                image: null,
                images: {},
                imgRpt: { error: false, msg: '', details: '' },
                // database management...
                archive: { chk: false, dtd: new Date(new Date()-2*365.25*24*60*60*1000).style('YYYY-MM-DD') },
                backup: { chk: true },
                clear: { chk: true, keep: 2 },
                dbdl: { chk: ['bak','db'] },
                dbRpt: { error: false, msg: '' },
                restore: { chk: false, file: {} },
                mngtRpt: [],
                ctlg: { chk: false, file: {}, rpt: {} }
            }),
            mounted() {
                this.fetchJSON('GET','/~private',{headers:{authorization: `Bearer ${this.$root.user.token}`}})
                .then(res=>{ return res.jxOK ? res.jx : []; })
                .then(dir=>{ this.docs = dir.listing.map((f,i)=>({index: i, url: encodeURI('/private/'+f), name: f, text: f})) })
                .catch(e=>console.error(e));
            },
            methods: {
                catalogRead() { this.fileReadDialog('catalog-file','text')
                    .then(f=>{ if (!f) return;
                        let ext = f.name.split('.').pop();
                        try {
                            let data = ext==='json' ? JSON.parse(f.contents) : ext==='csv' ? csv2obj(f.contents) : null;
                            if (!data) throw true;
                            f.source = 'data:application/json;base64,' + btoa(JSON.stringify(data));
                            this.ctlg.file=f;
                            this.ctlg.rpt = {error: false, msg: 'Catalog successfully read'}
                        } catch(e) {
                            this.ctlg.rpt = {error: e, msg: `Bad data or invalid data format "${ext}"`}
                            console.error('catalogRead:',e);
                            console.warn('catalogRead:',f);
                        }})
                        .catch(e=>{ this.ctlg.rpt={error: e, msg: 'Catalog read failed, see console!'}; console.error('catalogRead:',e)} );
                },
                chgBak(e) { if (e.target.checked) this.backup.chk = true; },
                chgDB(e) {if (e.target.checked) {this.backup.chk=true; this.archive.chk=false; this.clear.chk=false; this.ctlg.chk=false; } },
                dbRead() { this.fileReadDialog('db-file','text')
                    .then(db=>{ if (!db) return;
                        try {
                            let data = JSON.parse(db.contents);
                            if (!data) throw true;
                            db.source = 'data:application/json;base64,' + btoa(JSON.stringify(data));
                            this.restore.file=db;
                            this.dbRpt = {error: false, msg: 'Database successfully read'}
                        } catch(e) {
                            this.dbRpt = {error: e, msg: `Bad data or invalid data format`}
                            console.error('dbRead:',e);
                            console.warn('dbRead:',db);
                        }})
                    .catch(e=>{ this.dbRpt={error: e, msg: 'DB read failed, see console!'}; console.error('dbRead:',e)} );
                },
                docUpload() { this.fileReadDialog('doc-file','binary')
                    .then(f=>{ if (!f) return;
                        if (!f.contents) throw true;
                        let contents = 'data:application/octet-stream;base64,' + btoa(f.contents);
                        let body = [{ name: f.name, contents: contents, force: this.doc.force}];
                        this.fetchJSON('POST','/~private',{body:body, headers:{authorization: `Bearer ${this.$root.user.token}`}})
                            .then(res=>res.jxOK&&!res.jx.error ? res.jx : [])
                            .then(result=>{ this.doc.rpt = result[0]; })
                            .catch(e=>console.error("docUpload:",e));
                    })
                    .catch(e=>{ this.doc.rpt={error: e, msg: 'Document upload failed, see console!'}; console.error('docUpload:',e)} );
                },
                async download(i) {
                    console.log('download:',i,this.docs[i].url)
                    let headers = {
                        authorization: `Bearer ${this.$root.user.token}`,
                        Accept: '*/*',  
                        'Content-Type': 'application/octet-stream'    
                    }
                    let doc = await window.fetch(this.docs[i].url,{method: 'GET', headers: headers})
                    console.log('doc:',doc);
                    if (!doc.ok) return;
                    let contents = await doc.blob();
                    console.log('contents:',typeof contents, contents);
                    this.fileWriteDialog({contents: contents, name: this.docs[i].text});
                },
                imgDate(d) { return this.friendlyDate(d,'YYYY-MM-DDTh:mm:ss a z','local'); },
                imgLoad() {
                    let url = '/images/shopping/'+this.image.saveAs;
                    this.image.existing.src = url;
                    this.images[this.image.saveAs].src = url;
                },
                imgRead() { this.fileReadDialog('image-load','dataURL')
                    .then(i=>{if (i) { i.warn=i.size>this.SHOP.imageLimit[0]; this.image=i; this.imgStat(); }})
                    .catch(e=>console.error('imgRead:',e)); },
                imgSelect() { document.getElementById('image-load').click(); },
                imgStat() {
                    if (this.image.saveAs in this.images) {
                        this.image.existing = this.images[this.image.saveAs];
                        return;
                    };
                    this.fetchJSON('GET','/~pics/'+this.image.saveAs,{headers:{authorization: `Bearer ${this.$root.user.token}`}})
                        .then(res=>{ return res.jxOK ? res.jx : []; })
                        .then(stats=>{
                            if (stats && stats.file===this.image.saveAs) {
                                stats.date = this.imgDate(stats.mtime);
                                this.image.existing = { stats: stats, src:'' };
                                this.images[this.image.saveAs] = this.image.existing;
                            };
                            if (stats.error && stats.code===404) this.imgRpt = { error: false, msg: 'File not found on server!' };
                        })
                },
                imgUpload() {
                    let body = [ {name: this.image.saveAs, contents: this.image.contents, force: this.force} ];
                    console.log("body:",body);
                    this.fetchJSON('POST','/~pics',{body:body, headers:{authorization: `Bearer ${this.$root.user.token}`}})
                        .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                        .then(result=>{ this.imgRpt = result[0]; })
                        .catch(e=>console.error("imgUpload:",e));
                },
                patch() {
                    let instructions = [];
                    let keep = this.clear.chk ? this.clear.keep : 0;
                    if (this.backup.chk) instructions.push({action:'backup', backup:'shopping.json.'+new Date().style('stamp'), keep: keep});
                    if (this.archive.chk) {
                        instructions.push({action:'archive', recipe: 'carts', bindings: {dtd: this.archive.dtd}});
                        instructions.push({action:'archive', recipe: 'setups', bindings: {dtd: this.archive.dtd}});
                    };
                    if (this.ctlg.chk) instructions.push({action:'collection', collection:'catalog', source: this.ctlg.file.source});
                    if (this.dbdl.chk.includes('bak')) instructions.push({action:'download', download:'backup'});
                    if (this.dbdl.chk.includes('db')) instructions.push({action:'download', download:'database'});
                    if (this.restore.chk && this.restore.file.saveAs) instructions.push({action:'restore', source:this.restore.file.source});
                    console.log('instructions:',instructions)
                    this.fetchJSON('PATCH','/$shop',{body:instructions, headers:{authorization: `Bearer ${this.$root.user.token}`}})
                        .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                        .then(report=>{
                            this.mngtRpt = report;
                            report.filter(r=>r.action==='download' && !r.error)
                                .map(r=>({contents: JSON.stringify(r.contents), name: r.name, type: r.type}))
                                .map(file=>this.fileWriteDialog(file));
                        })
                        .catch(e=>console.error("patch:",e));
                },
                save(what,data) {
                    let cfg = what==='carts' ? {order: ['id', 'setup', 'set', 'unit', 'saved', 'cost']} : {};
                    let contents = this.format==='csv' ? obj2csv(data,cfg) : typeof data=='string' ? data : JSON.stringify(data,null,2);
                    let name = [what,this.format].join('.');
                    let type = this.format==='csv' ? 'text/csv; charset=UTF-8' : 'application/json; charset=UTF-8';
                    this.fileWriteDialog({contents: contents, name:name, type:type});
                }
            },
            template: /*html*/`
                <div id="shpg-cloud" class="shpg-cloud">
                <h4>Downloads/Uploads...</h4>
                <p>Carts/Catalog Format:
                    <label v-for="f of formats">
                      <input type="radio" name="dlFormat" v-model="format" :value="f[1]" :checked="f[1]==format" />{{ f[0] }}</label> 
                </p>
                <p>
                <button type="button" @click="save('carts',carts.raw)">Save Carts</button>
                <button type="button" @click="save('catalog',catalog.raw)">Save Catalog</button>
                </p>
                <a id="fileSaveAs" class="none" href=''>save</a>
                <p>Documentation:</p>
                    <p class="text-indent" v-for="d of docs"><a href="" @click.prevent="download(d.index)">{{d.text}}</a></p>
                <input class="none" id="doc-file" type="file" accept='*/*' />
                <button class="right" type="button" @click="docUpload">Upload Document</button>
                <label class="right"><input type="checkbox" v-model="doc.force" />Force</label>
                <span v-show="doc.rpt.msg" v-if-class:text-alert="doc.rpt.error" class="block text-indent clear">Msg: {{doc.rpt.msg}}</span>
                <hr class="clear">
                <h4>Product Image Management...</h4>
                    <button type="button" @click="imgRead">Select Image</button>
                    <input id="image-load" ref="image-load" class="hidden" type="file" accept='image/*'/>
                    <div id="stats" v-if="image&&image.existing" class="preview-grid">
                        <div class="preview-grid-cx text-large">Existing on server...</div>
                        <div class="preview-grid-c1">Filename:</div>
                        <div class="preview-grid-c2">{{image.existing.stats.file}}</div>
                        <div class="preview-grid-c1">Size:</div>
                        <div class="preview-grid-c2">{{image.existing.stats.size}} ({{asByteStr(image.existing.stats.size,1)}})</div>
                        <div class="preview-grid-c1">Date:</div>
                        <div class="preview-grid-c2">{{image.existing.stats.date}}</div>
                        <div class="preview-grid-c1">Preview:</div>
                        <div class="preview-grid-c2 stretch">
                            <i v-if="!image.existing.src" v-icon:preview @click="imgLoad"></i>
                            <img v-if="image.existing.src" class="preview-img" ref="image-existing" :src="image.existing.src" />
                        </div>
                    </div>
                    <div id="preview" v-if="image" class="preview-grid">
                        <div class="preview-grid-cx text-large">Local Image...</div>
                        <div v-show="image.warn" class="preview-grid-c1 text-alert">WARNING:</div>
                        <div v-show="image.warn" class="preview-grid-c2 stretch text-alert">Large image ({{SHOP.imageLimit[1]}}), 
                            consider resizing smaller for faster loading.</div>
                        <div class="preview-grid-c1">Filename:</div>
                        <div class="preview-grid-c2">{{image.file.name}}</div>
                        <div class="preview-grid-c1">Save As:</div>
                        <div class="preview-grid-c2">{{image.saveAs}}</div>
                        <div class="preview-grid-c1">Type:</div>
                        <div class="preview-grid-c2">{{image.type}}</div>
                        <div class="preview-grid-c1">Size:</div>
                        <div class="preview-grid-c2">{{image.size}} ({{asByteStr(image.size,1)}})</div>
                        <div class="preview-grid-c1">Date:</div>
                        <div class="preview-grid-c2">{{image.date}}</div>
                        <div class="preview-grid-c1">Preview:</div>
                        <div class="preview-grid-c2 stretch"><img class="preview-img" ref="image-preview" :src="image.contents" /></div>
                        <div class="preview-grid-c1"></div>
                        <div class="preview-grid-c2 stretch">
                            <button class="right" type="button" @click="imgUpload">Upload Image</button>
                            <label class="right"><input type="checkbox" v-model="force" />Force</label>
                        </div>
                        <div class="preview-grid-c1">Message:</div>
                        <div class="preview-grid-c2 stretch" v-if-class:text-alert="imgRpt.error">{{ imgRpt.msg }}</div>
                    </div>
                    <hr>
                    <h4>Database Management...</h4>
                    <div class="text-indent">
                        <label class="block"><input type="checkbox" v-model="backup.chk" />Backup Database</label>
                        <label class="block"><input type="checkbox" v-model="archive.chk" />Archive Carts and Setups 
                          <span class="block text-indent2">prior to: <input type="date" v-model="archive.dtd" /></span></label>
                        <label class="block"><input type="checkbox" v-model="clear.chk" />Clear backups prior to last
                        <input class="short-textbox" type="number" v-model="clear.keep"/></label>
                        <label class="block"><input type="checkbox" v-model="ctlg.chk" />Replace Catalog:</label>
                          <input class="none" id="catalog-file" type="file" accept='.csv,.json' />
                          <span class="block text-indent2">File: {{ ctlg.file?.saveAs||'No file specified...' }}
                            <i class="text-icon" v-icon:description @click="catalogRead"></i></span>
                          <span v-show="ctlg.rpt.msg" v-if-class:text-alert="ctlg.rpt.error" class="block text-indent2 text-alt">{{ctlg.rpt.msg}}</span>
                        <p>Save (local) copy of:<br>
                          <span class="text-indent2">
                            <label><input type="checkbox" name="dbdl" v-model="dbdl.chk" :value="'bak'" @change="chgBak" />Backup</label>
                            <label><input type="checkbox" name="dbdl" v-model="dbdl.chk" :value="'db'" />Database</label>
                            <button class="right" type="button" @click="patch">Manage</button>
                          </span></p>
                        <label class="block"><input type="checkbox" v-model="restore.chk" @change="chgDB"/>Restore database from (local) file:</label>
                          <input class="none" id="db-file" type="file" accept='.json' />
                          <span class="block text-indent2">File: {{ restore.file?.saveAs||'No file specified...' }}
                            <i class="text-icon" v-icon:description @click="dbRead"></i></span>
                          <span v-show="dbRpt.msg" v-if-class:text-alert="dbRpt.error" class="block text-indent2 text-alt">{{dbRpt.msg}}</span>
                        <div class="preview-grid">
                            <div class="preview-grid-cx text-large">Report...</div>
                            <div class="preview-grid-c1 text-bold">Action</div>
                            <div class="preview-grid-c2 stretch text-bold">Result...</div>
                            <template v-for="instruction of mngtRpt">
                            <div class="preview-grid-c1 text-case-title">{{instruction.action}}</div>
                            <div class="preview-grid-c2 stretch" v-if-class:text-alert="instruction.error" v-html="instruction.msg"></div>
                            </template>
                        </div>
                    </div>
                </div>`
        },
        'shpg-list-item': {
            props: ['item', 'only','scale', 'shopper'],
            data: ()=>({ showPic: false }),
            computed: {
                scaling() { return this.item.flags.includes('scale') ? this.scale : 1; }
            },
            template: /*html*/`
                <div class="cart-grid" v-show="!only || item.quan">
                    <div class="cart-grid-c1">
                        <i class="text-accent left-icon" v-icon:remove @click="$emit('quan',item.index,-1,scaling)"></i>
                        <span class="item-quan">{{item.quan}}</span>
                        <i class="text-accent right-icon" v-icon:add @click="$emit('quan',item.index,1,scaling)"></i>
                    </div>
                    <div class="cart-grid-c2">
                        <i class="text-accent inline-icon shop-pic-icon" v-icon:image @click="showPic=true"></i>
                        <shop-pic-popup v-if="showPic" :item="item" @hide="showPic=false"></shop-pic-popup>
                    </div>
                    <div class="cart-grid-c3">
                        <p class="cart-line">
                            <span class="text-small shop-badge">{{item.id}}</span>
                            <span class="text-plus text-bolder">{{item.item}}</span>
                            <span class="text-minus"><br>{{item.desc}}, LIMIT: {{scaling*item.limit}}</span>
                            <span class="text-normal text-minus" v-show="shopper"><br>LOT: {{item.lot}}, COST: {{as$(item.cost)}}
                                <span v-show="item.note"><br>NOTE: {{ item.note }}</span></span>
                        </p>
                    </div>
                </div>`
        },
        'shpg-list': {
            props: ['cart', 'catalog', 'completed', 'counts', 'group', 'listing', 'setup', 'shopper'],
            data: function() { return {
                cartOnly: false,
                cmpld: this.completed,
                grp: this.group,
                only: false,    // show only cart items
                showShoppingHelp: false,
                xblk: ''
            }},
            computed: {
                listCount() { return this.completed ? this.counts[0] : this.counts[1] },
                notAllowed() { return !this.listing.allowed.length },
                permitted() { return !this.notAllowed || this.shopper; },
                list() {
                    // never allow unused items; always allow admin inventory; pass allowed categories; include specialized items
                    let allow = (i) => i.flags.includes('unused') ? false : this.listing.unit.startsWith('$') ? true : 
                        this.listing.allowed.includes(i.category) ? true : this.listing.special.includes(i.id);
                    let categories = this.catalog.categories.slice(0);
                    let groups = {}; categories.forEach(c=>groups[c]=[]);
                    for (let i of this.catalog.items) if (allow(i)) groups[i.category].push(i.index);
                    let cx = categories.filter(c=>groups[c].length);
                    let scaling = {}; categories.forEach(c=>scaling[c]=this.listing.scale[c]||1);
                    return { categories: cx, groups: groups, scaling: scaling };
                }
            },
            template: /*html*/`
                <div id="shpg-list" class="shpg-list">
                    <div v-if="setup.id">
                    <p v-show="!permitted">NOT PERMITTED TO SHOP!</p>
                    <div v-if="permitted">
                        <p class="text-large text-center">Due Date: <span class="text-bold">{{ friendlyDate(setup.due) }}</span></p>
                        <p class="text-large">List for <span class="text-bold">
                            {{ SHOP.unitsInfo.by[cart.set][cart.unit].unit.label }}</span> at {{ SHOP.setsLabels[cart.set] }}
                            <i class="text-accent inline-icon" v-icon:help @click="showShoppingHelp=!showShoppingHelp"></i>
                        </p>
                        <span v-show="showShoppingHelp">
                        <p>
                          To see items for each section (i.e. BABY, PERSONAL, ...), click the <i class="text-icon text-alt" v-icon:expand_more></i> 
                          icon to expand that section. Click the <i class="text-icon text-alt" v-icon:expand_less></i> icon to hide items for a 
                          section. The <i class="text-icon text-alt rotate45" v-icon:unfold_more></i> icon toggles expanded sections. The 
                          <span class="text-bold text-alt">Expand All</span> and <span class="text-bold text-alt">Collapse All</span> buttons 
                          can also be used to show/hide all sections at once.
                        </p>
                        <p>
                          To add/remove items to your cart, click the <i class="text-icon text-alt" v-icon:add></i>/<i class="text-icon text-alt" v-icon:remove></i>
                          icons for the specific item to select the appropriate quantity. Purchase quantity limits apply, as shown in the description of each item.
                          To see a representative image for any item, click on the <i class="text-icon text-alt" v-icon:image></i> for the item.The 
                          <span class="text-bold text-alt">Show Cart Items Only/Show All Items</span> button toggles between showing the whole 
                          shopping list and only items in your cart.
                        </p>                          
                        <p class="text-indent text-large text-alt text-bold">
                          When finished shopping, be sure to click the <span class="text-bold text-alt">SAVE CART</span> button at the bottom 
                          to complete your shopping!
                        </p>
                        </span>
                        <span v-show="shopper">
                        <p class="cart-count">
                            {{ listCount }} {{ pluralize(listCount,'Cart') }} of {{ counts[1] }}
                            <button type="button" class="left" @click="$emit('active',-1)">Previous Cart</button>
                            <button type="button" class="right" @click="$emit('active',+1)">Next Cart</button>                        
                        </p>
                        <p class="text-normal">Filter:
                            <input type="checkbox" v-model="cmpld" @change="$emit('completed',cmpld)" />Completed carts only<br>
                            <label class="inline" v-for="g of SHOP.grouping"><input type="radio" name="shoppingListGrouping" 
                                :checked="g[1]===grp" :value="g[1]" v-model="grp" @change="$emit('group',grp)" />{{g[0]}}</label>
                        </p>
                        </span>
                        <toggle-button :init="only" :labels="'Show Cart Items Only,Show All Items'" @state="()=>only=!only"></toggle-button>
                        <button type="button" @click="()=>xblk='all'">Exapnd All</button>
                        
                        <button type="button" @click="()=>xblk='none'">Collapse All</button>
                        <p v-show="notAllowed" class="text-large text-bolder text-alt">No Shopping List for this cart...</p>
                        <x-blk v-for="c in list.categories" :blk="c" :hdr="c" :xblk="xblk" @xblk="x=>xblk=x">
                            <shpg-list-item v-for="i in list.groups[c]" :item="catalog.items[i]" :only="only" :scale="list.scaling[c]" 
                              :shopper="shopper" @quan="(idx,chg,scale)=>$emit('quan',idx,chg,scale)"></shpg-list-item>
                        </x-blk>
                        <h5 class="text-line-pad">Order Notes...</h5>
                        <textarea class="cart-notes" v-pattern:text.pat.asc placeholder="List other requests here..." v-model="cart.notes"></textarea>
                        <p>Total Cart Value: {{as$(cart.cost)}}</p>
                        <div class="text-indent text-alt text-bold">NOTICE:
                          <p class="text-indent">All shopping requests made at the discretion of the shopping coordinator.</p>
                          <p class="text-indent">Substitutions may be made based on availability or coordinator's discretion.</p>
                        </div>
                        <p class="text-right"><button type="button" @click="$emit('save')">Save Cart</button></p>
                        <p>Last saved: {{ friendlyDate(cart.saved,'XD XM D Y" @ "hh:mm:ss','local','NEVER') }} by {{cart.by||'-?-'}}</p>
                    </div>
                    </div>
                    <div v-else><p>NO Shopping session presently available...</p></div>
                </div>`
        },
        'shpg-notes': {
            props: ['carts'],
            computed: {
                location() { return this.carts.setup.location; },
                orderedUnits() { return this.SITE.apts[this.location].slice(0).concat(this.SITE.offices[this.location]); },
                tally() {
                    let carts = this.carts.table.filter(cx=>!(cx.unit.startsWith('$')||cx.unit==='*')).filter(cc=>cc.notes);
                    let units = carts.map(c=>c.unit);
                    let orderedCarts = this.orderedUnits.map(u=>carts[units.indexOf(u[1])]).filter(c=>c);
                    let info = orderedCarts.map(cart=>({ unit: cart.unit, notes: cart.notes.replaceAll('|','<br>'),
                      label: this.SHOP.unitsInfo.by[this.location][cart.unit].unit.label }));
                    return info;
                }
            },
            template: /*html*/`
                <div id="shpg-notes" class="shpg-notes shop-new-page shop-break">
                    <h3>Order Notes ({{ SHOP.setsLabels[location] }}) ...</h3>
                    <div class="text-indent" v-for="{label,notes} in tally">
                        <h4>Unit {{ label }} ...</h4>
                        <p class="text-indent text-small">{{ notes }}</p>
                    </div>
                </div>`
        },
        'shop-pic-popup': {
            props: ['item'],
            template: /*html*/`
                <div class="shop-pic-popup">
                    <i v-icon:cancel @click="$emit('hide')"></i>
                    <div class="shop-pic">
                        <img class="item-pic" :src="'/images/shopping/'+item.image" :alt="item.image" @click="$emit('hide')" />
                        <p>{{ item.item }}<br><span class="text-small">{{ item.desc }}</span></p>
                    </div>
                </div>`
        },
        'shpg-setup': {
            props: ['catalog', 'listings','setups','sid'],
            data: function () { return {
                setup: this.setups.table[this.sid?this.setups.table.map(s=>s.id).indexOf(this.sid):this.setups.table.length-1],  // setup data...
                index: this.sid?this.setups.table.map(s=>s.id).indexOf(this.sid):this.setups.table.length-1,    // setup index
                listing: this.listings.table[0],    // active listing
                set: this.listings.table[0].set,    // listing set
                tag: this.listings.table[0].unit,   // listing unit tag
                showSetupHelp: false,
                showUnitHelp: false
            }},
            computed: {
                active() { return this.sid===this.setup.id },
                categories() { return this.catalog.categories.slice(0); },
                special() { return this.catalog.items.filter(i=>i.flags.includes('special')); },
                today() { return new Date().style('YYYY-MM-DD','local'); },
                unitLabel() { return (this.units.by[this.tag]||{unit:{label:''}}).unit.label },
                units() { return { by: this.SHOP.unitsInfo.by[this.set], keys: this.SHOP.unitsInfo.keys[this.set] }; }
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
                    this.index = (x===-1) ? ((this.index===null) ? this.setups.table.length-1 : (this.index===0) ? null : this.index-1) :
                      (x===1) ? ((this.index===null) ? 0 : (this.index===(this.setups.table.length-1)) ? null : this.index+1) : null;
                    this.setup = this.index!==null ? this.setups.table[this.index] : 
                      { id: null, location: this.setup.location, due: this.today, dtd: this.today };
                }
            },
            template: /*html*/`
                <div id="shpg-setup" class="shpg-setup">
                    <div>
                        <h4>Shopping Setup...<i class="text-accent inline-icon" v-icon:help @click="showSetupHelp=!showSetupHelp"></i></h4>
                        <span v-show="showSetupHelp">
                        <p>
                            Shopping setup defines the due date, shopping date, location, and inventory stocks used.
                            Using the <span class="text-bold text-alt">Previous/Next</span> buttons allows editing of multiple setups.
                        </p>
                        <p>
                            The <span class="text-bold text-alt">Set As Active</span> button applies the current setup to the shopping lists.
                        </p>
                        <p>
                            Save setup definitions using the <span class="text-bold text-alt">Save Setup</span> button. Each setup change must
                            be saved indenpendently.
                        </p>
                        </span>
                        <button type="button" @click="chgIdx(-1)">Previous</button>
                        <button type="button" class="right" @click="chgIdx(1)">Next</button>
                        <div class="setup-grid">
                            <div class="setup-grid-c1">ID #:</div>
                            <div class="setup-grid-c2">{{setup.id||'NEW'}}<span v-if="active"> (ACTIVE)</span></div>
                            <div class="setup-grid-c1">Location:</div>
                            <div class="setup-grid-c2">
                                <label class="inline" v-for="lx of SITE.locations">
                                <input type="radio" name="setupLocation" :checked="lx[1]===setup.location" 
                                :value="lx[1]" v-model="setup.location" />{{lx[0]}}</label>
                            </div>
                            <div class="setup-grid-c1">Due Date:</div>
                            <div class="setup-grid-c2"><input type="date" v-model="setup.due"></div>
                            <div class="setup-grid-c1">Shopping:</div>
                            <div class="setup-grid-c2"><input type="date" v-model="setup.dtd"></div>
                            <div class="setup-grid-c1">Apply Stock:</div>
                            <div class="setup-grid-c2">
                                <label v-for="[label,tag] in SHOP.stocks.IV">
                                    <input type="checkbox" name="stock" v-model="setup.stock" :value="tag" />{{label}}</label>
                            </div>
                        </div>
                        <button type="button" @click="$emit('active',setup)">Set As Active</button>
                        <button type="button" class="right" @click="$emit('setup',setup)">Save Setup</button>
                    </div>
                    <hr>
                    <div>
                        <h4>Per Unit Settings... <i class="text-accent inline-icon" v-icon:help @click="showUnitHelp=!showUnitHelp"></i></h4>
                        <span v-show="showUnitHelp">
                        <p>
                            These settings determine the shopping list customization for each unit (i.e. apartments, offices, and inventories).
                            The "Unit Set" serves as a filter to limit the number of units to make it easier to sort through sets of units.
                            Each unit can be allowed to shop for each category indenpendently. Additionally, the number of household/colleague 
                            members can be specified for scaling the limit for certain products. For example, the number of wipes may be scaled 
                            for a household with 2 babies by setting the count for that category to 2. Finally, a set of specialty items may be 
                            selected for each shopping unit by checking the appropriate items.
                        </p>     
                        </span>
                        <p>Unit Set: 
                            <label class="flex" v-for="sx of SHOP.sets"><input type="radio" name="listingSet" :checked="sx[1]===set" 
                                :value="sx[1]" v-model="set" @change="chgSet" />{{sx[0]}}</label>
                        </p>
                        <p>List for <i class="text-accent icon-button" v-icon:chevron_left @click="chgUnit(-1)"></i>
                            {{ " "+unitLabel+" " }} (#{{listing.id||'NEW'}})
                            <i class="text-accent icon-button" v-icon:chevron_right @click="chgUnit(1)"></i>
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
        'shpg-status': {
            props: ['carts', 'contacts', 'listings'],
            data: function () { return {
                message: '',
                mode: 'sms',
                modes: [['Text/Mail','sms'],['Mail/Text','mail'],['Text&Mail','both']],
                responses: [],
                who: [] // selected usernames
            }},
            computed: {
                completed() { return this.carts.table.filter(c=>c.set===this.location).map(c=>c.unit) },
                incomplete() { return this.unitsByLocation.filter(u=>!this.completed.includes(u)) },
                location() { return this.carts.setup.location },
                sortedUsernames() {
                    let ordered = this.contacts.usernamesOrderedByName;
                    let mid = Math.trunc((ordered.length+1)/2);
                    let usernamesX2 = ordered.reduce((x,v,i,a)=>i<mid?x.concat([a[i],a[i+mid]]):x,[]).filter(u=>u);
                    return usernamesX2;
                },
                unitsByLocation() { return this.listings.table.filter(l=>l.allowed.length&&(l.set===this.location)).map(l=>l.unit); },
                usernamesByLocation() { return this.contacts.usernames.filter(u=>this.contacts.raw[u].other.location===this.location); }
            },
            methods: {
                chgWho(grp) {
                    let who  = this.who;
                    let usernames = this.contacts.usernames;
                    switch (grp) {
                        case 'all': who = usernames.slice(0); break;
                        case 'incomplete': who = usernames.filter(u=>this.incomplete.includes(this.contacts.raw[u].other.unit)); break;
                        case 'location': who = usernames.filter(u=>this.location===this.contacts.raw[u].other.location); break;
                        case 'not': who = usernames.filter(u=>!who.includes(u)); break;
                        default: return;
                    }
                    this.who = who;
                },
                async notify() {
                    let self = this;
                    async function send(url,body) {
                        return await self.fetchJSON('POST',url,{body: body, headers:{authorization: `Bearer ${self.$root.user.token}`}})
                        .then(res=>res.jxOK&&!res.jx.error ? res.jx : null)
                        .catch(e=>console.error("notify[send]:",e));
                    };
                    this.responses = [];
                    let respond = (res=>{ 
                        if (res instanceof Array) {
                            res.forEach(r=>respond(r))
                        } else { 
                            console.log('notify:',res); 
                            this.responses.push({error: res.error, msg: res.summary?.msg || res.msg});
                        }});
                    let toSMS = this.who.filter(w=>this.contacts.raw[w].phone);
                    let toNoSMS = this.who.filter(w=>!this.contacts.raw[w].phone&&this.contacts.raw[w].email);
                    let toMail = this.who.filter(w=>this.contacts.raw[w].email);
                    let toNoMail = this.who.filter(w=>this.contacts.raw[w].phone&&!this.contacts.raw[w].email);
                    let toNone = this.who.filter(w=>!this.contacts.raw[w].phone&&!this.contacts.raw[w].email);
                    let sms = { id:'SSN', text: this.message };
                    let mail = { subject: 'Saranam Shopping Network', text: this.message, from: this.$root.user.username };
                    try {
                    switch (this.mode) {
                        case 'sms': 
                            if (toSMS.length) respond(await send('/@text',{}.mergekeys(sms).mergekeys({to: toSMS})));
                            if (toNoSMS.length) respond(await send('/@mail',{}.mergekeys(mail).mergekeys({to: toNoSMS})));
                            break;
                        case 'mail':
                            if (toMail.length) respond(await send('/@mail',{}.mergekeys(mail).mergekeys({to: toMail})));
                            if (toNoMail.length) respond(await send('/@text',{}.mergekeys(sms).mergekeys({to: toNoMail})));
                            break;
                        case 'both':
                            if (toSMS.length) respond(await send('/@text',{}.mergekeys(sms).mergekeys({to: toSMS})));
                            if (toMail.length) respond(await send('/@mail',{}.mergekeys(mail).mergekeys({to: toMail})));
                            break;
                    };
                    } catch (e){ console.error(e)};
                    if (toNone.length) respond(toNone.map(f=>({error: true, msg: `No contact for ${this.contacts.raw[f].fullname}`})))
                },
            },
            template: /*html*/`
                <div id="shpg-status" class="shpg-status">
                <h4>Shopping Status...</h4>
                <p class="text-indent">Complete: {{ completed.join(', ') }}</p>
                <p class="text-indent">Incomplete: {{ incomplete.join(', ') }}</p>
                <h4>Notify...</h4>
                <p>Select: 
                <button type="button" @click="chgWho('all')">All</button>
                <button type="button" @click="chgWho('incomplete')">Incomplete</button>
                <button type="button" @click="chgWho('location')">{{SHOP.setsLabels[carts.setup.location]}}</button>
                <button type="button" @click="chgWho('not')">Toggle</button>
                </p>
                <div class="notify-grid">
                    <label v-for="(u,i) in sortedUsernames" :class="'notify-grid-c'+(1+i%2)+' text-compress'">
                        <input type="checkbox" name="notify-who" v-model="who" :value="u" />
                        {{contacts.raw[u].fullname}} ({{contacts.raw[u].other.unit}})
                        <i v-show="contacts.raw[u].phone" class="text-super" v-icon:phone_iphone></i>
                        <i v-show="contacts.raw[u].email" class="text-super" v-icon:mail></i>
                    </label>
                </div>
                <div class="notify-message">
                    <p class="notify-message">Message...</p>
                    <textarea class="notify-message" v-model="message" placeholder="Type text/mail message here..."></textarea>
                </div>
                <p class="text-compress">Primary/Secondary:
                    <label v-for="(m,i) in modes">
                        <input type="radio" name="notify-mode" v-model="mode" :value="modes[i][1]"/>{{modes[i][0]}}</label>
                </p>
                <button class="right" type="button" @click="notify">Send</button>
                <div>
                    <p v-for="res of responses" v-if-class:text-alert="res.error">{{res.msg}}</p>
                </div>
                </div>`
        },
        'shpg-suppliers': {
            props: ['carts', 'catalog', 'setup'],
            computed: {
                tally() {
                    let tx = { ids: [], items: {}, quan: [], stock: [], categories: {}, suppliers: [], cost: {} };
                    // tally shopping carts before stock...
                    this.carts.table.filter(cx=>!cx.unit.startsWith('$')).forEach(c=>{
                        c.items.forEach(i=>{
                            let [ id,quan ] = i;
                            if (!tx.ids.includes(id)) { tx.ids.push(id); tx.stock.push(0); tx.quan.push(0); };
                            tx.quan[tx.ids.indexOf(id)] += quan;
                        })
                    })
                    this.carts.table.filter(cx=>cx.unit.startsWith('$')&&this.setup.stock.includes(cx.unit)).forEach(c=>{
                        c.items.forEach(i=>{
                            let [ id,quan ] = i;
                            if (tx.ids.includes(id)) tx.stock[tx.ids.indexOf(id)] += Math.abs(quan);  // only add stock for shopping items
                        })
                    })
                    this.catalog.items.filter(ci=>tx.ids.includes(ci.id)).forEach(i=>{
                        let index = tx.ids.indexOf(i.id);
                        let buy = Math.ceil(tx.quan[index] > tx.stock[index] ? (tx.quan[index]-tx.stock[index])/(i.lot||1) : 0);
                        if (buy) {
                            if (!tx.suppliers.includes(i.supplier)) { tx.suppliers.push(i.supplier); tx.categories[i.supplier]=[]; 
                                tx.items[i.supplier]={}; tx.cost[i.supplier]=0; };
                            if (!tx.categories[i.supplier].includes(i.category)) { tx.categories[i.supplier].push(i.category); tx.items[i.supplier][i.category]=[] }
                            tx.items[i.supplier][i.category].push({item: i, buy: buy});
                            tx.cost[i.supplier] += buy * i.cost;
                        };
                    })
                    return tx;
                }
            },
            template: /*html*/`
                <div id="shpg-suppliers" class="shpg-suppliers">
                    <h3>Supplier Lists...</h3>
                    <div class="supplier-list shop-new-page shop-break" v-for="s of tally.suppliers">
                        <h4>{{ s }}</h4>
                        <div class="supplier-category" v-for="c of tally.categories[s]">
                            <h5>{{ c }}</h5>
                            <div class="supplier-grid">
                                <template v-for="{item,buy} in tally.items[s][c]">
                                <span class="supplier-grid-c1">{{ buy }}</span>
                                <span class="supplier-grid-c2">
                                    <span class="text-small shop-badge">{{item.id}}</span>{{ item.item }}<br>
                                    <span class="text-small text-faded">{{item.desc}}</span>
                                    <span class="text-small text-italic" v-if="item.note"><br>NOTE: {{ item.note }}</span>
                                </span>
                                </template>
                            </div>
                        </div>
                        <p class="text-large">Estimated Total Cost: {{ as$(tally.cost[s]) }}</p>
                    </div>
                </div>`
        },
        'shpg-unit-lists': {
            props: ['carts', 'catalog'],
            computed: {
                location() { return this.carts.setup.location; },
                orderedUnits() { return this.SITE.apts[this.location].slice(0).concat(this.SITE.offices[this.location]); },
                tally() {
                    let tx = { totalCost: 0, cost: {}, items: {}, notes: {}, units: [] };
                    this.carts.table.filter(cx=>!(cx.unit.startsWith('$')||cx.unit==='*')).forEach(c=>{ tx.units.push(c.unit);
                        tx.cost[c.unit] = c.cost; tx.notes[c.unit]=c.notes.replaceAll('|','<br>'), tx.items[c.unit] = [];
                        let ids = []; let quantities = [];
                        c.items.forEach(i=>{ ids.push(i[0]); quantities.push(i[1])});
                        let items = this.catalog.items.filter(ci=>ids.includes(ci.id));
                        items.map((item,idx)=>{
                            tx.items[c.unit].push({item: item, quan: quantities[idx]});
                        });
                    })
                    // sort by SITE units definition and expand tag and label...
                    tx.units = this.orderedUnits.filter(u=>tx.units.includes(u[1])).map(u=>({tag:u[1],label:u[0]}));
                    tx.units.forEach(u=>tx.totalCost += tx.cost[u.tag]);
                    return tx;
                }
            },
            template: /*html*/`
                <div id="shpg-unit-lists" class="shpg-unit-lists">
                    <h3>Unit Lists...</h3>
                    <div class="unit-list shop-new-page shop-break" v-for="{tag,label} in tally.units">
                        <h4>Unit {{ label }}  ({{ SHOP.setsLabels[location] }})</h4>
                        <div class="unit-list-grid">
                            <template v-for="{item,quan} in tally.items[tag]">
                                <span class="unit-list-grid-c1">{{ quan }}</span>
                                <span class="unit-list-grid-c2">
                                    <span class="text-small shop-badge">{{item.id}}</span>{{ item.item }}<br>
                                    <span class="text-small text-faded">{{item.desc}}</span>
                                </span>
                            </template>
                        </div>
                        <h5>Notes...</h5>
                        <p class="text-indent text-small">{{ tally.notes[tag] }}</p>
                        <p class="text-large">Estimated Unit Cost: {{ as$(tally.cost[tag]) }}</p>
                    </div>
                    <p class="text-large">Estimated TOTAL Cost: {{ as$(tally.totalCost) }}</p>
                </div>`
        }
    }
}

export default shopLib;
