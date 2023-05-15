/***
 * @module apiware.js
 * This modules provides an endpoint handler for the homebrew API.
 * (c) 2020 Enchanted Engineering, MIT license
 * The app.js file conditionally loads this file and treats all exported functions as middleware
 * It can be used as is or as a skeleton for user customizable API. 
 * @example
 *   const cw = require('./apiware');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const fsp = require('fs').promises;
const { getAllMethods, print, resolveSafePath, splitAt, verifyThat } = require('./helpers');
const { auth: {genCode}, internals, mail, safeStat, sms } = require('./workers');  
const { ResponseContext } = require('./serverware');
const jxDB = require('./jxDB');
const jsonata = require('jsonata');


///*************************************************************
/// declarations...
var apiware = {};               // serverware middleware container    


///*************************************************************
/// apiware Homebrew API handler
///*************************************************************
/**
 *  All apiware have the signature 'function defineMiddleware(options) { ... ; return async function (ctx) {...}; }'
 *  app.js binds all functions to the site scope for access to objects such as scribe 
 */

 
///*************************************************************
/// Homebrew API workers...


/**
 * @function info gets client and authorized internal server data
 * @param {object} ctx request context
 * @return {object} client and authorized server information
 */
function info(ctx) {
    let ok = ctx.authorize('server');
    let { ip:raw, port } = ctx.request.remote;
    let v4 = raw.replace(/:.*:([\d.]+)/,($0,$1)=>$1.includes('.')?$1:'127.0.0.'+$1);
    let v6 = (v4!=raw) ? raw : "0:0:0:0:0:0:0:0";
    let dx = new Date().style();
    switch (ctx.request.params.recipe) {
        case 'iot': return { ip: v4, time: dx.e, iso: dx.iso };
        case 'cfg': return ok ? this : {};
        case 'ctx': return ok ? ctx : {};
        case 'internals': return ok ? internals() : {statistics:internals().statistics};
        case 'info':
        default:
            let info = { ip: {raw: raw, v4: v4, v6: v6, port: port}, date: dx };
            info.mergekeys(ok?internals():{statistics:internals().statistics});
            if (ok) { info.mergekeys({cfg: this, ctx: ctx});
            return info;
    };
};

/**
 * @function mask gets or sets scribe mask level to control level of detail transcripted
 * @param {object} ctx request context
 * @return {object} current mask level
 */
function scribeMask(ctx) {
    let mask = this.scribe.mask(ctx.authorize('server') ? ctx.args.level||ctx.args.opts[0] : '');
    return { msg: `Scribe mask: ${mask}`, mask: mask };
};

/**
 * @function sendMail site specific preprocessor to translate user identities into valid email addresses
 * @param {object} msg email message containing text and identities to which it is sent
 * @return {object} a report summary 
 */
async function sendMail(msg) {
    let site = this;
    let scribble = this.scribe;
    let addressBook = site.db.users.query('contacts',{ref:'.+'}).mapByKey(v=>v.email);
    let letter = {from: msg.from ? msg.from.includes('@')?msg.from:addressBook[msg.from] : '', subject: msg.subject||msg.subj };
    let timestamp = msg.time ? '['+new Date().toISOString()+']' : '';
    let header = msg.header || msg.hdr || (msg.id||msg.time) ? msg.id+timestamp+':\n' : '';
    if (msg.text) letter.text = header ? header + msg.text : msg.text;
    ['to','cc','bcc'].forEach(addr=>{  // resolve email addressing
       let tmp = msg[addr] instanceof Array ? msg[addr] : typeof msg[addr]=='string' ? msg[addr].split(',') : [];
       tmp = tmp.map(a=>a.includes('@')?a:addressBook[a]).filter(a=>a).filter((v,i,a)=>v && a.indexOf(v)===i).join(',');
       if (tmp.length) letter[addr] = tmp;
    });
    scribble.trace(`sendMail: ${letter}`);
    let response = await mail(letter);
    return response;
};

/**
 * @function sendText site specific preprocessor to translate user identities into valid phone numbers
 * @param {object} msg text message containing text and identities to which it is sent
 * @return {object} a report summary and queue details 
 */
async function sendText(msg) {
    let site = this;
    let scribble = this.scribe;
    let phoneBook = site.db.users.query('contacts',{ref:'.+'}).mapByKey(v=>v.phone);
    let tmsg = { callback: msg.callback, id: msg.id || '' };    // format optional header with id and/or time
    tmsg.timestamp = msg.time ? '['+new Date().toISOString()+']' : '';
    tmsg.body = msg.body || ((msg.header || msg.hdr || ((tmsg.id||tmsg.timestamp) ? tmsg.id+tmsg.timestamp+':\n' : '')) + msg.text);
    // map recipients, group or to "users and/or numbers" to prefixed numbers...
    let list = [msg.recipients,msg.group,msg.to].map(g=>(g||'').toString()).filter(n=>n).join(',').split(',');
    tmsg.numbers = list.map(n=>isNaN(n)?phoneBook[n]:n).filter((v,i,a)=>v&&a.indexOf(v)===i);
    scribble.trace('sendText:',list, msg, tmsg);
    let response = await sms(tmsg);
    return response;
};

/**
 * @function twilio handles Twilio status callback messages as well as no reply responses
 * @param {object} rpt Twilio message report data (JSON)
 * @return {string} XML response data
 */
function twilio(ctx) {
    let scribble = this.scribe;
    if (ctx.args.opts?.[0]!=='status') 
        return "<Response><Message>No one receives replies to this number!</Message></Response>";
    let rpt = ctx.request.body || {};
    if (rpt.MessageStatus=='undelivered') {
        let notice = `Message to ${rpt.To} failed, ref: ${rpt.MessageSid}`;
        scribble.warn(`Action[twilio]: ${notice}`);
        sms({contact: ctx.args.opts[1], text: notice})
          .then(data=>{ scribble.log(`Twilio callback made to '${ctx.args.opts?.[1]}' for ${rpt.MessageSid}`); })
          .catch(err=>{ scribble.error(`Action[twilio]: ${err}`); }); 
    };
    return "<Response></Response>"; // empty XML response == 'OK'
};


async function recall(db,ctx) {
    let scribble = this.scribe;
    scribble.trace(`recall: ${ctx.args.recipe} ${print(ctx.args)}`);
    let recipe = db.lookup(ctx.args.recipe||'');    // get recipe
    scribble.trace(`recipe: ${print(recipe,60)}`);
    if (verifyThat(recipe,'isEmpty')) return await ctx.next();
    let auth = recipe.auth instanceof Array ? recipe.auth[0] : recipe.auth;
    if (auth && !ctx.authorize(auth)) throw 401;  // check auth
    return db.query(recipe,{}.mergekeys(ctx.args),ctx.user);     // query db
};

async function store(db,ctx) {
    let scribble = this.scribe;
    scribble.trace(`store: ${ctx.args.recipe} ${print(ctx.args)}`);
    let recipe = db.lookup(ctx.args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) return await ctx.next();
    let auth = recipe.auth instanceof Array ? recipe.auth[1] : recipe.auth;
    if (auth && !ctx.authorize(auth)) throw 401;  // check auth
    return db.modify(recipe,ctx.request.body,ctx.user);
};

async function patch(db,ctx) {
    let scribble = this.scribe;
    scribble.trace(`patch: ${ctx.args.recipe}, ${print(ctx.args)}, ${db.schema('tag')}, ${print(db.schema())}, ${ctx.authorize('admin,patch')}`);
    if (!ctx.authorize(db.schema('auth')||'admin')) throw 401;      // check auth: DB auth or admin
    if (ctx.args.recipe!==db.schema('tag') || db.schema('tag')==='users') throw 400;    // match must be for this db and not users
    let instructions = ctx.request.body;
    scribble.trace(`instructions: ${print(instructions)}`)
    let summary = [];
    let [dbPath,dbFile] = splitAt(db.schema('file'),db.schema('file').lastIndexOf('/')+1);
    //let report = (action,msg)=>summary.push({action: action, msg: msg});
    for (let i of instructions) {
        scribble.trace('x:',i);
        let rpt = { action: i.action, msg:'' };
        try {
            switch (i.action) {
                case 'backup':
                    let dir = await fsp.readdir(dbPath);
                    let backups = dir.filter(f=>f.startsWith(dbFile+'.')).sort();
                    if (i.keep && backups.length>i.keep) {
                        rpt.msg = 'Cleaning up old backups...' 
                        for (let k=0;k<i.keep;k++) { let s=backups.pop(); if (s) rpt.msg += '<br> Keeping: '+s; };
                        for (let f of backups) { await fsp.rm(resolveSafePath(dbPath,f)); rpt.msg += '<br> Removed: '+f; };
                    };
                    let backup = i.backup&&i.backup.startsWith(dbFile+'.') ? i.backup : dbFile+'.'+new Date().style('stamp');
                    let json = JSON.stringify(db.db());
                    await fsp.writeFile(resolveSafePath(dbPath,backup),json,'utf-8');
                    rpt.msg += (rpt.msg ? '<br>':'') +`Created: ${backup}`;
                    break;
                case 'archive':
                    let r = db.lookup(i.recipe);
                    if (!r.archive) throw 'Bad request, no archive found in archive recipe';
                    if (!r.collection) throw 'Bad request, no collection found in archive recipe';
                    if (!r.parts) throw 'Bad request, no expression found in archive recipe';
                    let [archived,preserved] = jsonata(r.parts).evaluate(db.db(),i.bindings);
                    db.db(r.archive,'@',archived);
                    db.db(r.collection,'$',preserved);
                    db.changed();
                    rpt.msg = `Archived ${archived.length} from ${r.collection} to ${r.archive}; ${preserved.length-1} records remain.`;
                    break;
                case 'collection':
                    let contents = JSON.parse(typeof i.source==='string' ? i.source :
                      (typeof i.source=='object' && i.source.tempFile) ? await fsp.readFile(i.source.tempFile) : i.source);
                    db.db(i.collection,'$',contents);
                    db.changed();
                    rpt.msg = `Collection ${i.collection} replaced...`;
                    break;
                case 'download':
                    let download = db.db();
                    rpt.msg = dbFile;
                    rpt.type = 'application/json';
                    rpt.name = dbFile;
                    if (i.download=='backup') {
                        let bak = (await fsp.readdir(dbPath)).filter(f=>f.startsWith(dbFile+'.')).sort().pop();
                        download = !bak ? '' : JSON.parse(await fsp.readFile(resolveSafePath(dbPath,bak),'utf-8'));
                        rpt.msg = !download ? 'No contents for backup download.' : bak;
                        rpt.name = bak;
                    };
                    rpt.contents = download;
                    break;
                case 'restore':
                    let source = JSON.parse(typeof i.source==='string' ? i.source :
                      (typeof i.source=='object' && i.source.tempFile) ? await fsp.readFile(i.source.tempFile) : i.source);
                    db.db({source: source});
                    db.changed();
                    rpt.msg = 'Database restored from source!'
                    break;
                default:
                    rpt.msg = 'WARN: Unknown action!';
            }
        } catch (e) {
            rpt.msg = (rpt.msg ? '<br>':'') + `ERROR: ${e.toString()}`;
            rpt.error = true;
        }
        summary.push(rpt);
    }
    return summary;
};

// get ~recipe handler to return file stats...
async function stats(db,ctx) {
    let scribble = this.scribe;
    scribble.trace(`stat: ${ctx.args.prefix+ctx.args.recipe} ${print(ctx.args)}`);
    let recipe = db.lookup(ctx.args.prefix+ctx.args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) return await ctx.next();
    if (!recipe.root) throw {code: 500, detail: "upload ERROR: bad recipe precheck -- no root!:"};
    let auth = recipe.auth instanceof Array ? recipe.auth[1] : recipe.auth;
    if (auth && !ctx.authorize(auth)) throw 401;  // check auth
    let opts = (ctx.args.opts||[]).slice(0);
    let leaf = opts.pop();
    let fspec = decodeURI(resolveSafePath(recipe.root,...opts,leaf));
    let stats = await safeStat(fspec);
    if (stats===null) return null;
    let lst = stats.isDirectory() ? await fsp.readdir(fspec) : null;
    let isProps = getAllMethods(stats).filter(m=>m.startsWith('is')).reduce((obj,p)=>{obj[p]=stats[p]();return obj;},{});
    return ({ recipe: recipe.name, path: opts.join('/'), file: leaf, listing: lst })
        .mergekeys(stats.mapByKey(v=>v instanceof Date ? v.toISOString() : v)
        .mergekeys(isProps).filterByKey((v,k)=>!recipe.stats||recipe.stats.includes(k)));
};

// post ~recipe handler for file uploads...
async function upload(db,ctx) {
    let scribble = this.scribe;
    scribble.trace(`upload: ${ctx.args.prefix+ctx.args.recipe} ${print(ctx.args)}`);
    let recipe = db.lookup(ctx.args.prefix+ctx.args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) return await ctx.next();
    if (!recipe.root) throw {code: 500, detail: "upload ERROR: bad recipe precheck -- no root!:"};
    let auth = recipe.auth instanceof Array ? recipe.auth[1] : recipe.auth;
    if (auth && !ctx.authorize(auth)) throw 401;  // check auth
    if (!verifyThat(ctx.request.body,'isArrayOfTrueObjects')) throw {code:400, msg: "Array of 'file' objects expected!"};
    let results = [];
    for (let f of ctx.request.body) {
        scribble.trace(`UPLOAD file: ${print(f)}`);
        let path = (ctx.args.opts||[]).filter(o=>o!=='..').join('/')
        let fldr = f.folder || path || ctx.args.folder || recipe.folder || '';
        let fpath = resolveSafePath(recipe.root,fldr);
        let backup = f.backup || recipe.backup || '';
        let force = f.force || recipe.force || false;
        if (!await safeStat(fpath)) { results.push({error:true, msg: `Destination folder ${fldr} not found!`}); continue; }
        let spec = resolveSafePath(fpath,f.name);
        let exists = await safeStat(spec);
        let conditions = `EXISTS: ${!!exists}, BACKUP: '${backup}', FORCE: ${force}`;
        scribble.trace(`UPLOAD[${spec}]: ${conditions}`);
        if (exists && backup) {
            let backupSpec = resolveSafePath(rt,fldr,backup);
            await fsp.copyFile(spec,backupSpec);
        };
        if (!exists || force || backup) {
            if (typeof f.contents == 'object') {
                await fsp.copyFile(f.contents.tempFile,spec);
                await fsp.rm(f.contents.tempFile);
            } else {
                await fsp.writeFile(spec,f.contents);
            };
            results.push({error: false, msg: `File ${f.name} uploaded to folder [${recipe.name}]/${fldr}`});
            scribble.trace(`UPLOAD[${spec}]: saved...`);
        } else {
            results.push({error: true, msg: `${f.name} exists, use force or backup to enable saving`, details: conditions});
            scribble.trace(`UPLOAD[${spec}]: NOT saved, use force or backup to enable saving...`);
        }
    };
    return results;
}

/**
 * @function api serves request endpoints defined by the Homebrew API.
 * @param {object} [options]
 * @return {object} middleware
 */
apiware.api = function api(options={}) {
    let site = this;
    let scribble = this.scribe;
    let db = options.database ? (typeof options.database=='string' ? site.db[options.database] : new jxDB(options.database)) : site.db.site;
    if (!db) scribble.fatal('Required database NOT defined for Homebrew API middleware!');
    scribble.trace(`Homebrew API middleware configured to use ${db.file} database.`);
    scribble.info(`Homebrew API middleware initialized with route '${options.route}'...`);
    return async function apiCW(ctx) {
        scribble.trace(`api route[${ctx.routing.route.method}]: ${ctx.routing.route.route}`);
        switch (ctx.request.params.prefix) {
            case '$': 
                if (ctx.verbIs('get')) return await recall.call(site,db,ctx)
                if (ctx.verbIs('post,put')) return await store.call(site,db,ctx);
                if (ctx.verbIs('patch')) return await patch.call(site,db,ctx)
                throw 405;
            case '@':   // built-in actions (defined as 'recipe' paramter field)
                if (ctx.request.method!=='post') throw 405;
                switch (ctx.request.params.recipe) {
                    case "scribe": return scribeMask.call(site,ctx);
                    case "mail": 
                        if (!ctx.authorize('contact')) throw 401;
                        return await sendMail.call(site,ctx.request.body||{});
                    case "text": 
                        if (!ctx.authorize('contact')) throw 401;
                        return await sendText.call(site,ctx.request.body||{});
                    case "twilio": return new ResponseContext('xml',Buffer.from(twilio.call(site,ctx)));
                    default: throw 404;
                };
            case '!':   // server information
                if (ctx.verbIs('get')) return info.call(site,ctx);
                throw 405;
            case '~':   // pseudo stat/upload recipe
                if (ctx.verbIs('get')) return await stats.call(site,db,ctx);
                if (ctx.verbIs('post')) return await upload.call(site,db,ctx);
                throw 405;
            default: 
                return await ctx.next();
        };
    };
};

// Export functions...
module.exports = apiware;