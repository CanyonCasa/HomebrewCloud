/*

jxDB.js: Simple JSON based database using JSONata query tool
(c) 2020 Enchanted Engineering, Tijeras NM.; created 20200512 by CanyonCasa

usage:
  const jxDB = require('./jxDB');
  var db = new jxDB(def,data);

configuration object properties...
  file:         Database file name, default '_memory_'
  delay:        Cache delay time for reloading/saving changes to file, default 1000ms
  format:       'tabular' (default), 'pretty' or undefined
  readOnly:     Flag to prevent writing to database.
  tag:          reference tag for transcript messages
data...
  {...}       Optional object to populate database. 
                Primary keys represent collections (tables)
                Records (rows) consist of objects or arrays

NOTES:
  1.  Database is always an object; speicifically, an array of objects or arrays.
  2.  When the configuration does not define a file, the database exists only in memory.
  3.  Assumes sanitized data, that is, data sanitizing handled externally
  4.  Collections may be arrays of objects or arrays of arrays.
  6.  Intended for small memory-based (synchronous) responses such as small number of users accounts.

*/

require('./Extensions2JS');
const fs = require('fs');
const fsp = fs.promises;
const readline = require('readline');
const jsonata = require('jsonata');
const { jxCopy, jxSafe, print, verifyThat } = require('./helpers');
const { Scribe } = require('./workers');

// "private" database interface... (assumes valid args based on internal only calls!)
function dbWrapper(database) {
    var dbase = {}.mergekeys(database);

    return function(collection, ref, value) {
        // database and collection actions...
        if (collection===undefined) return dbase;                   // database getter
        if (collection instanceof Object) { 
            if ('source' in collection) {                           // setter for whole database
                for (let [key,value] of Object.entries(collection.source)) dbase[key] = value;
                for (let key of Object.keys(dbase)) if (!(key in collection.source)) delete dbase[key];
                //dbase = collection.source;
            } else {
                Object.keys(collection).forEach(c => {
                    if (ref===null) {                               // collection merge setter
                        if (dbase[c] instanceof Array) {
                            dbase[c] = [...dbase[c],...collection[c]];
                        } else {
                            dbase.mergekeys(collection);
                        };
                    } else {
                        dbase[c] = collection[c];                   // replace existing collection
                    };
                });
            };
            return dbase;
        };
        if (ref===undefined) return dbase[collection];              // return the collection (or schema)
        if (ref==='$') {
            dbase[collection] = value;                              // replace entire collection
            return dbase[collection];                               // return the collection (or schema)
        };
        if (ref==='@') {
            dbase[collection] = dbase[collection].concat(value);    // append array of entries to collection
            return dbase[collection];                               // return the collection (or schema)
        };
        // schema object is not an array; note no schema ref getter, use this.db('_')[ref] syntax
        if (collection==='_') {
            if (ref===null) return undefined;                       // not allowed
            dbase[collection][ref] = value;                         // schema setter
            return dbase[collection][ref];                          // return the schema value (or undefined)
        };
        // single entry change of collection
        if (ref===null) {
            if (value===undefined) return undefined;                // not allowed
            dbase[collection].push(value);                          // new entry
            return dbase[collection][-1];
        };
        if (value===undefined) {                                    // empty record, delete entry
            if (dbase[collection] instanceof Array) dbase[collection].splice(ref,1);
            return undefined
        };
        dbase[collection][ref] = value;                             // update entry
        return dbase[collection][ref];
    };
};


function jxDB(def={},data) {
    // default database definition; '_' collection holds cfg (i.e. schema)...
    let dbx = {'_':{}, recipes:[]}.mergekeys(data || {});       // temp dbx, data only used for new databases
    this.file = def.file || '_memory_';
    let exists = this.file!=='_memory_' && fs.existsSync(this.file);
    if (exists) {
        try {
            let source = fs.readFileSync(this.file,'utf8');
            dbx = JSON.parse(source);
        } catch (e) { throw `ERROR reading existing database ${this.file}: ${e}`};
    };
    // override with configuration...
    let schema = {
        format: def.format || dbx['_'].format || 'tabular',     // storage: pretty, tabular, packed
        delay: def.delay!==undefined ? def.delay : 
          dbx['_'].delay!==undefined ? dbx['_'].delay : 2000,   // changed write delay, default 2000ms
        readOnly: def.readOnly || dbx['_'].readOnly || false,   // flag to inhibit changes
        file: this.file,                                        // for reference only
        tag: def.tag || dbx['_'].tag || this.file.replace(/^.*[\\/]|\..*$/g, '') || 'DB',  // for reference only
        auth: def.auth || dbx['_'].auth || ''                   // auth for DB (PATCH) operations; ''==admin
    };
    dbx['_'].mergekeys(schema);
    this.db = dbWrapper.call(this,dbx);                         // wrapper for private data interface

    this.scribble = Scribe(schema.tag||'db');                   // transcripting reference

    // file watch and reloading; prohibits/ignores changes during saving with wait timeout...
    this.watcher = (function(){
        let watch = { self: this, fileWatch: null, reloading: false, saving: false, tag: schema.tag, timex: null, wait: dbx['_'].delay };
        if ((def.watch!==false) && (this.file!=='_memory_') && exists) {
            watch.fileWatch = fs.watch(watch.self.file,evt=>{
                if (evt=='change') {    // external transfer or file save change
                    if (watch.saving || watch.reloading) return;
                    watch.reloading = true;
                    // wait a moment for external transfer/save to finish ...
                    setTimeout(()=>{ watch.self.reload().then(x=>{ watch.reloading=false; }).catch(e=>{}); }, watch.wait);
                };
            });
            this.scribble.note(`Watching database '${def.tag||this.file}' for changes`);
        };
        return function(action) {
            if (typeof action==='object') {
                watch.mergekeys(action);
            } else if (action==='save') {
                watch.saving = true;
                clearTimeout(watch.timex);
                watch.timex = setTimeout(()=>{watch.self.save.call(watch.self);},watch.wait);
            } else if (action==='resume') {
                watch.saving = false;
                watch.timex = null;
            }
            return watch;
        }
    }).call(this);    //IIFE
    this.scribble.debug(`Database ${schema.tag} successfully initialized...`);
};

// re-load database file into memory.
jxDB.prototype.reload = async function reload() {
    try {
        let source = await fsp.readFile(this.file,'utf8');
        this.db({source: JSON.parse(source)});  // jumps to error on parsing failure
        this.scribble.info(`jxDB.reload successful: ${this.file}`);
    } catch (e) { this.scribble.warn(`jxDB.reload failed: ${this.file} --> ${e.toString()}`) };
};

// wrapper to alter readOnly flag.
jxDB.prototype.readOnly = function readOnly(flag) {
    if (flag!==undefined) this.schema('readOnly',!!flag);
    return this.schema('readOnly');
};

// save the database 
jxDB.prototype.save = function save() {
    function tabulate(db) { // formats db in a tabular layout of 1 row per object 
        let tables = Object.keys(db);
        let tArray = (n) => db[n] instanceof Array;  // table is Array
        let leader = (n) => `  "${n}": ${tArray(n) ? '[':'{'}\n`;
        let trailer = (n) => `  ${tArray(n) ? ']':'}'},\n`;
        let jx = '{\n';
        tables.forEach(n=>{
            t = db[n];
            jx += leader(n);
            if (tArray(n)) {
                let items = t.map(i=>`    ${JSON.stringify(i)}`);
                jx += items.join(',\n') + '\n';
            } else {
                let rows = Object.keys(t).filter(k=>t[k]!==undefined).map(k=>`    "${k}": ${JSON.stringify(t[k])}`);
                jx += rows.join(',\n') + '\n';
            };
            jx += trailer(n);
        });
        return jx.slice(0,-2) + '\n}';  // strip trailing comma and newline and add back newline
    };
    if ((this.file==='_memory_') || this.readOnly()) return;
    this.watcher({saving:true}); // this needs to be set if save function called directly
    let frmt = this.schema('format');
    var data = frmt=='tabular' ? tabulate(this.db()) : JSON.stringify(this.db(),null,frmt=='pretty'?2:undefined);
    fsp.writeFile(this.file,data,'utf8')
        .then(x=>{ this.watcher('resume'); })
        .then(x=>{ this.scribble.trace(`jxDB.save successful: ${this.file}`); })
        .catch(e=>{ this.scribble.error(`jxDB.save failed: ${this.file} --> ${e.toString()}`); });
};

// set or return schema
jxDB.prototype.schema = function schema(key,value) { 
    if (key===undefined) return Object.assign({},this.db('_'));
    if (value===undefined) return this.db('_')[key];
    this.db('_',key,value);
    return value;
};

// queue the database to be saved...
jxDB.prototype.changed = function changed() {
    if (this.readOnly() || this.file==='_memory_') return;
    this.watcher('save');
};

// returns a list of currently defined collection names...
jxDB.prototype.collections = function collections() { return Object.keys(this.db()).filter(k=>k!='_'); };

// lookup a recipe by name
jxDB.prototype.lookup = function lookup(recipeName) {
    return Object.assign({},jsonata(`recipes[name="${recipeName}"]`).evaluate(this.db())||{});
};

// simple database query...
// recipeSpec defines recipe.name or actual recipe object
// bindings represent optional recipe expression substitutions or null
// returns data or undefined (no recipe) or null, but never error condition...
jxDB.prototype.query = function query(recipeSpec, bindings=null, user={}) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    if (!recipe.expression) {   // precheck verifies required recipe fields...
        this.scribble.trace("jxDB.query ERROR: bad recipe precheck -- no expression!:",print(recipeSpec)); 
        throw {code: 500, detail: "jxDB.query ERROR: bad recipe precheck -- no expression!:"};      
    };
    // prep params... defaults (recipe.bindings) and/or query bindings may or may not be defined
    this.scribble.extra("jxDB.query precheck OK"); 
    let params = recipe.bindings!==undefined ? Object.assign({},recipe.bindings) : null;
    if (bindings) params = params ? params.mergekeys(bindings) : bindings;
    this.scribble.trace("jxDB.query params",params);
    try {    
        if (params) params = jxSafe(params,recipe.scrub||'*');
        this.scribble.extra("jxDB.query safe params",params);
        params = params ? params.mergekeys({_: user}) : {_: user};
        this.scribble.trace(`jxDB.query[${recipe.name}] params: ${print(params,60)}`);
        let tmp = jsonata(recipe.expression).evaluate(this.db(),params);
        if (verifyThat(tmp,'isNotDefined')) return recipe.dflt||null;
        // workaround -> jsonata returns by reference so need to deepcopy to prevent corrupting database!
        tmp = typeof tmp==='object' ? (tmp instanceof Array ? [] : {}).mergekeys(tmp) : tmp;
        if (tmp instanceof Array) {
            let lmt = recipe.limit || 0;
            if (lmt && (tmp.length>Math.abs(lmt))) tmp = (lmt<0) ? tmp.slice(lmt) : tmp.slice(0,lmt);
            if (recipe.header) tmp.unshift(recipe.header);
        };
        return tmp;
    } catch (e) {
        this.scribble.log(`jxDB.query ERROR: ${typeof e=='object'?e.message:e.toString()}`); 
        return recipe.dflt||null;
    };
};
// simple database edit...
// recipeSpec defines recipe.name or actual recipe object
// data defines an array of objects/arrays in form 
//   [{ref:<value>, record:<record_object>},...] or [[<value>,<record_object>],...], where
//   ref refers to unique matching value for an existing entry based on recipe 'unique' lookup; null for new entry
//   record refers to data to be saved, undefined/null to delete record; 
//   note: update performs a full record replacement after merge with defaults and existing record,
// returns array of acctions taken for each entry...
jxDB.prototype.modify = function modify(recipeSpec, data, user={}) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    let results = []; // always an array
    let result = (a,r,x) =>results.push({action: a, ref: r, detail: x});
    this.scribble.trace(`MODIFY[${this.schema('tag')||this.schema('file')}]: ${print(recipe,60)}`);
    this.scribble.trace(`  DATA: ${print(data,60)}`);
    this.scribble.dump(`MODIFY[${this.schema('tag')||this.schema('file')}]: ${print(recipe,60)} => ${print(data,60)}`);
    if (!recipe.collection || !this.db()[recipe.collection]) {  // precheck verifies required recipe fields...
        this.scribble.error("jxDB.modify ERROR: bad recipe precheck -- no collection!:",print(recipeSpec));
        throw {code: 500, detail: "jxDB.modify ERROR: bad recipe precheck -- no collection!:"};
    };
    if (!verifyThat(data,'isArrayOfAnyObjects')) {
        this.scribble.error(`ERROR: jxDB.modify expects an array of objects: ${print(data)}`);
        return [{action: 'error', ref: null, detail:'ERROR: jxDB.modify expects an array of objects'}];
        return results;
    };
    for (let d of data) {
        try {
            let ref = d.ref||d[0]||null;
            let record = d.record||d[1]||null;
            this.scribble.trace(`ref: ${ref}, record: ${print(record).substring(0,20)}, see ${this.scribble.file} for details`);
            this.scribble.dump(`ref: ${ref}, record: ${print(record)}`);
            if ((ref===null) && (record===null)) { result("bad request",null,null); continue; };    // bad request if no ref AND no record
            let existing = (ref!==null) && recipe.query && jsonata(recipe.query).evaluate(this.db(),{ref:ref}) ||
                { index: null, record: null };
            this.scribble.trace(`existing: ${existing.index!==null}`);
            if (record) {
                if (existing.index===null) { // add new record, which may have a defined ref or ref: null...
                    let newRecord = recipe.entry instanceof Array ? record : jxCopy(recipe.entry||{}).mergekeys(record);
                    // unique should return a unique index value for collection and key value applies to, such as id, tag, 0
                    let unique = recipe.unique ? jsonata(recipe.unique).evaluate(this.db()) : {};
                    if ('key' in unique) { ref=ref||unique.value||1, newRecord[unique.key] = newRecord[unique.key]||unique.value||1; };
                    let safeNewRecord = jxSafe({ref: ref, record: newRecord},recipe.filter||'*');
                    this.scribble.dump(`jxDB.modify[new ${recipe.name}]: ${print(safeNewRecord)}}`);
                    this.scribble.trace(`jxDB.modify[new ${recipe.name}]: ${print(safeNewRecord,60)}}`);
                    this.db(recipe.collection,null,safeNewRecord.record);
                    result("added",safeNewRecord.ref,this.db(recipe.collection).length-1);
                } else {    // change existing record...
                    let chgRecord = recipe.entry instanceof Array ? record : {}.mergekeys(existing.record).mergekeys(record);
                    let safeRecord = {index: existing.index}.mergekeys(jxSafe({ref: ref, record: chgRecord},recipe.filter||'*'));
                    this.scribble.dump(`jxDB.modify[chg ${recipe.name}]: ${print(safeRecord)}}`);
                    this.scribble.trace(`jxDB.modify[chg ${recipe.name}]: ${print(safeRecord,40)}}`);
                    this.db(recipe.collection,existing.index,safeRecord.record);
                    result("changed",ref,existing.index);
                };
            } else {    // no record given...
                if (existing.index!==null) {    // existing record was found, so delete index
                    this.db(recipe.collection,existing.index); // delete record
                    this.scribble.trace(`delete record: ${existing.index}`);
                    result("deleted",ref,existing.index);
                } else {    // existing entry not found means nothing to do
                    this.scribble.trace(`JXDB NOP: ref: ${ref}, record: ${print(record,{max:40})}`)
                    result("nop",ref,null);   // delete non-existing record?
                };
            };
        } catch(e) { 
            let msg = typeof e=='object' ? e.message:e.toString();
            this.scribble.dump("jxDB.modify ERROR: ",e); 
            this.scribble.error("jxDB.modify ERROR: ",msg); 
            result('error',ref,msg);
        };
    };
    if (results.some(r=>r.action!=="nop")) this.changed(); // flag changes for save
    return results; // array of actions and references for each data record.
};

// external database query...
// recipeSpec defines recipe.name or actual recipe object; fields includes
//   file: required path to external file
//   limit: specifies an optional max number of data entries returned; negative value returns from tail
//   header: boolean that specifies whether to treat first line of file as header.
// returns array of sequential data entries or undefined (no recipe) or null, but never error condition...
jxDB.prototype.recall = async function recall(recipeSpec, bindings=null, user={}) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    if (!recipe.file) {   // precheck verifies required recipe fields...
        this.scribble.trace("jxDB.recall ERROR: bad recipe precheck -- no file!:",print(recipeSpec)); 
        throw {code: 500, detail: "jxDB.recall ERROR: bad recipe precheck -- no file!:"};      
    };
    // prep params... defaults (recipe.bindings) and/or query bindings may or may not be defined
    let params = {}.mergekeys(recipe.bindings).mergekeys(bindings);
    params = (jxSafe(params,recipe.scrub||'*')).mergekeys({_: user});
    this.scribble.trace(`jxDB.recall[${recipe.name}] params: ${print(params,60)}`);
    try {
		let results = [];
		let header = null;
		let jobj;
        let n=0;

        const fileStream = fs.createReadStream(recipe.file);
        const rl = readline.createInterface({input: fileStream});

        for await (const line of rl) {
            n++;
            if (!line) return;
            try { 
                jobj=JSON.parse(line);
            } catch (e) { 
                console.error(`Parse Error[#${n}]: ${line}\n${e.message.toString()}`)
            }; 
            if (!header && params.header) { header = jobj; continue; };
            if (!params.limit||(params.limit>0&&results.length<params.limit)||(params.limit<0)) results.push(jobj);
            if (params.limit<0 && (results.length>-params.limit)) results.shift();
        };
        if (header) results.unshift(header);
        return results;
    } catch (e) {
        this.scribble.log(`jxDB.recall ERROR: ${typeof e=='object'?e.message:e.toString()}`); 
        return recipe.dflt||null;
    };
};

// external database edit...
// recipeSpec defines recipe.name or actual recipe object
// data defines an array of objects/arrays in form for appending to file
// returns array of acctions taken for each entry...
jxDB.prototype.store = async function store(recipeSpec, data, user={}) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    let results = []; // always an array
    let result = (a,r,x) =>results.push({action: a, ref: r, detail: x});
    this.scribble.trace(`  DATA: ${print(data,60)}`);
    this.scribble.dump(`STORE[${recipe.file}]: ${print(recipe,60)} => ${print(data,60)}`);
    if (!recipe.file) {  // precheck verifies required recipe fields...
        this.scribble.error("jxDB.store ERROR: bad recipe precheck -- no collection!:",print(recipeSpec));
        throw {code: 500, detail: "jxDB.store ERROR: bad recipe precheck -- no file!:"};
    };
    if (!verifyThat(data,'isArrayOfAnyObjects')) {
        this.scribble.error(`ERROR: jxDB.store expects an array of objects: ${print(data)}`);
        return [{action: 'error', ref: null, detail:'ERROR: jxDB.store expects an array of objects'}];
    };
	let lines = data.map(line=>JSON.stringify(jxSafe(line,recipe.filter||'*'))).join('\n')+'\n';
    return fsp.appendFile(recipe.file,lines,'utf8')
        .then(x=>{ this.scribble.trace(`${data.length} lines added to ${recipe.file}`); })
		.then(x=>[{action: 'added', ref: null, detail:`${data.length} lines added to database`}])
		.catch(e=>[{action: 'error', ref: null, detail:`ERROR: jxDB.store ${e.message.toString()}`}]);
};

jxDB.prototype.test = async function() { console.log('jxDB.test!'); return ['test']; }

module.exports = jxDB;
