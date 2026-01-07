/***
 * @module nativeware.js
 * This modules provides endpoint handler methods and declarations for apps.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const mw = require('./nativeware');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const { asList, asStr, resolveSafePath, verifyThat, print } = require('./helpers');
const { analytics, auth, blacklists, jwt, listFolder, mail, safeAccess, safeStat, sms } = require('./workers');  
const { Cache, FileEntry } = require('./caching');
const { ResponseContext } = require('./serverware');


///*************************************************************
/// declarations...
// serverware nativeware container    
var nativeware = {
	routes: {	// default routes
		account: '/user/:action/:user?/:opts*',
		login: '/:action(login|logout)'
	}
};


///*************************************************************
/// nativeware built-ins with specific worker/helper functions
///*************************************************************
/**
 *  All nativeware have the signature 'function defineMiddleware(options) { ... ; return async function (ctx) {...}; }'
 *      bound to the site scope for access to functions such as scribe 
 */

/**
 * @function grant authorizes specified users temporary login access by text or email
 * @param {object} ctx request context
 * @return {object} summary message
 */
async function grant(ctx) {
    let site = this;
    let scribble = this.scribe;
    if (!('users' in site.db)) throw 501;
    let usersDB = site.db.users;
    let users = asList(ctx.args.user|| ctx.args.users || ''); // comma delimitted string
    if (users.length===0) throw {code: 400, msg: 'No user list specified'};
    let exp = ((e)=>e>10080 ? 10080 : e)(ctx.args.exp || ctx.args.opts?.[0] || 30); // limited expiration in min; IIFE
    let by = ctx.args.opts?.[1]==='text' ? 'text' : ctx.args.opts?.[1]==='mail' ? 'mail' : 'auto';
    let ft = (t,u)=>{return u=='d' ? (t>7?7:t)+' days' : u=='h' ? (t>24?ft(t/24,'d'):t+' hrs') : t>60? ft(t/60,'h') : t+' mins'};
    let expStr = ft(exp);
    let contacts = usersDB.query('$contacts',{ref:'.*'});
    scribble.trace(`grant users: ${users}, exp: ${expStr}, by: ${by}`);
    try {
    let queue = await Promise.all(users.map(u=>{
        if (!contacts[u]) return { report: null, summary: { msg: `No contact for user` }};
        let passcode = auth.getLoginCode();
        usersDB.chgUser(u,{credentials:{ passcode: passcode }});
        let msg =`${ctx.user.fullname} granted access to...\n  user: ${u}\n  passcode: ${passcode.code}\n  valid: ${expStr}`;
        scribble.trace(`Action[grant] ${msg.replaceAll('\n','')}`);
        if (by!=='mail' && contacts[u].phone) {
            return sms({ to:contacts[u].phone, text: msg });
        } else if ((by==='mail' && contacts[u].email) || (by==='auto' && !contacts[u].phone && !contacts[u].email)){
            return mail({ to:contacts[u].email, text: msg });
        } else { // no specified contact...
            let via = by==='text' ? 'phone' : by==='mail' ? 'email' : 'phone/email';
            return { report: null, summary: { msg: `No contact ${via} for user` }};
        }
    }));
    let ok=[], fail=[];
    let reporting = (rpt,i) =>{
        if (rpt.error) { scribble.warn(print(rpt.summary.msg,80));} else {scribble.info(print(rpt.summary.msg,80)); };
        (rpt.error ? fail : ok).push(users[i]);
    };
    queue.forEach((rpt,i)=>{ if (rpt instanceof Array) { rpt.forEach(r=>reporting(r,i)); } else { reporting(rpt,i) }; });
    return { msg: `Login code sent by ${by} to ${ok.join(',')}`, ok: ok, fail: fail, queue:queue }
    } catch(e) { 
        let emsg = `Action[grant]: Granting permission failed => ${e.toString()}`;
        scribble.error(emsg);
        throw {code: 500, msg: emsg, detail: e};
    };
};

/**
 * @function account handles user account management, i.e. create, update, delete users
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.account = function account(options={}) {
    let self = this;
    let scribble = this.scribe;
    let usersDB = this.db.users;
    scribble.info(`Account nativeware initialized ...`);
    return async function accountMW(ctx) {
        let { action, user, opts } = ctx.request.params;
        let recipe = '$' + action;
        let manager = ctx.authorize('admin,manager');       // authenticated admin or manager
        let rauth = usersDB.lookup(recipe).auth || 'admin'; // recipe specific auth or default to admin
        scribble.trace(`user[${ctx.request.method}]: ${print(ctx.args)} (${rauth})`);
        if (ctx.verbIs('get')) {
            switch (action) {
                case 'code':        // GET /user/code/<username> (request activation code)
                    if (!user) throw 400;
                    let usr = usersDB.getUser(user);
                    if (verifyThat(usr,'isEmpty')) throw 400;
                    usr.credentials.passcode = auth.getActivationCode();
                    usersDB.chgUser(user,usr);
                    let { credentials, credentials: { passcode }, email, phone, username } = usr;
                    let text = `Challenge code: ${passcode.code} user: ${username}`;
                    // if opts[0]=='mail' then by mail, i.e. GET /user/code/<username>/mail, otherwise by SMS
                    let { report, queue } = await ( opts?.[0]==='mail' ? mail({time: true, to: email, text: text}) :
                      sms({time: true, to: phone, text: text}) );
                      let msg = `Challenge code[${passcode.code}] sent to ${username} at ${opts?.[0]?email:phone}`
                      let msgSafe = `Challenge code[?] sent to ${username} at ${opts?.[0]?email:phone}`
                      scribble.info(msg);
                    return { msg: manager?msg:msgSafe, queue: manager?queue:null, report: report };
                case 'grant':
                    if (!ctx.authorize('grant')){ scribble.warn(`Manager/admin authorization required: ${action}`); throw 401; }
                    return await grant.call(self,ctx);
                    break;
                case 'groups':      // GET /user/groups
                    if (!ctx.authorize(rauth)) { scribble.warn(`Manager/admin authorization required: ${action}`); throw 401; };
                    return usersDB.query('$groups');
                 case 'users':       // GET /user/users
                    if (!ctx.authorize(rauth)) { scribble.warn(`Manager/admin authorization required: ${action}`); throw 401; };
                    return usersDB.query('$users',{ref:user||'.+'});
                case 'contacts':    // GET /user/contacts
                    if (!ctx.authorize(rauth)) { scribble.warn(`Contacts authorization required: ${action}`); throw 401; };
                    return usersDB.query('$contacts',{ref:user||'.+'});
                case 'names':       // GET /user/names
                    if (!ctx.authorize(rauth)) { scribble.warn(`Authorization required: ${action}`); throw 401; };
                    return usersDB.query('$names',{ref:user||'.+'});
                    //let uData = usersDB.query(action,{ref:user||'.+'});
                    //if (uData) { return uData } else { throw 400; };
                default:
                    scribble.warn(`Unsupported user information request: ${action}`);
                    throw 400;
            };
        };
        if (ctx.verbIs('post')) {
            switch (action) {
                case 'code':        // POST /user/code/<username>/<code> (validate activation code)
                    let who = usersDB.getUser(user);
                    if (verifyThat(who,'isEmpty')) throw 400;
                    if (opts[0] && auth.checkCode(opts[0],who.credentials.passcode) && who.status=='PENDING') {
                        who.status = 'ACTIVE';
                        usersDB.chgUser(who.username,who);
                    };
                    return { msg: `User account is ${who.status}`, detail: who.status };
                case 'change':      // POST /user/change (new or update or delete)
                    if (!verifyThat(ctx.request.body,'isArrayOfAnyObjects')) throw 400;
                    let data = ctx.request.body;
                    let changes = [];
                    for (let usr of data) {
                        let record = usr.record || usr[1]; // usr.ref||usr[0] not trusted as same, record.username used instead
                        if (record===undefined) throw {code: 400, msg: 'NO record, possibly misformated body => [{ref:..., record:...}, ...]'};
                        if (verifyThat(record,'isTrueObject') && record.username) {
                            record.username = record.username.toLowerCase();    // force lowercase usernames only
                            let selfAuth = record.username===ctx.user.username
                            // if user exists change action, else create action...
                            let existing = usersDB.query('$userByUsername',{username: record.username},{});
                            let exists = verifyThat(existing,'isNotEmpty');
                            if (exists && !(manager||selfAuth)) throw 401;    // authorize changes or assume new
                            self.scribe.trace(`existing(${exists}) user[${record.username}]: ${print(existing,60)}`);
                            // authorized here if: new account (not exists), user is self, or manager/admin
                            self.scribe.trace(`Verified as: self[${record.username===ctx.user.username}], manager[${manager}]`);
                            if (!exists || selfAuth || manager) {
                                // build a safe record... filter credentials, membership, and status
                                let safe = exists ? existing.credentials : {hash:'',passcode:{},pin:''};
                                if (record.credentials) {
                                    if (record.credentials.password) safe.hash = await auth.genHashPW(record.credentials.password);
                                    if (record.credentials.pin) safe.pin = record.credentials.pin;
                                } else if (record.password) {	// temporary backward compatibility
									safe.hash = await auth.genHashPW(record.password);
									delete record.password;
								};
                                record.credentials = safe;
                                self.scribe.trace(`user record[${record.username}] ==> ${print(record,40)}`);
                                let entry = {member: '', status: 'PENDING'}.mergekeys(record);
                                // can't change one's own membership or status only manager/admin can...
                                if (exists) entry.mergekeys({member: existing.member, status: existing.status});
                                if (manager) {
                                    entry.status = record.status || entry.status;
                                    entry.member = record.member || entry.member;
                                };
                                // history managed here...
                                let now = new Date().toISOString();
                                entry.history = existing?.history || [];
                                entry.history.push([now,ctx.user.username||entry.username]);
                                self.scribe.trace(`user entry[${entry.username}] ==> ${print(entry,60)}`);
                                changes.push({user: record.username, result: usersDB.chgUser(record.username,entry)[0]||{}});
                            } else {
                                changes.push({code: 401, user: record.username, msg: self.server.emsg(401)});   // not authorized
                            };
                        } else {
                          changes.push({code: 400, user: record.username, msg: self.server.emsg(400)});     // malformed request
                        };
                    };
                    if (changes.length) scribble.trace(`user[${ctx.user.username||'-'}] changes...`);
                    changes.forEach(u=>scribble.trace(`  user[${u.user}(${u.result?.detail||'-'})]: ${u.result?.action||u.msg}`));
                    return changes;
                case 'groups':
                    if (!manager) throw 401;
                    let grps = ctx.request.body;
                    return usersDB.modify('$groups',grps);
                default: throw 400;
            };
        };
        if (ctx.verbIs('patch') && action==='archive') {
            if (!ctx.authorize(usersDB.schema('auth')||'admin')) throw 401;      // check auth: DB auth or admin
            let data = usersDB.query('$archive');
            let arc = usersDB.db('archive','@',data[0]);
            let usrs = usersDB.db('users','$',data[1]);
            usersDB.changed();
            let amsg = `Archived ${data[0].length} users; ${data[1].length} ACTIVE users.`
            scribble.log(amsg);
            return {msg: amsg, archive: arc.length, archived: data[0].length, active: usrs.length};
        };
        throw 501;  // other methods not supported
   };
};


/**
 * @function blacklistCheck rejects the request to terminate connection
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.blacklistCheck = function blacklistCheck(options={}) {
    let scribble = this.scribe;
    let blacklistExpressions = asList(options.blacklist ? options.blacklist : options).map(b=>RegExp(b));
    scribble.info(`Blacklist nativeware initialized... ${blacklistExpressions.length} expressions defined!`);
    return async function blacklistCheckMW(ctx) {
        let path =ctx.request.pathname;
        blacklistExpressions.forEach(x=>{
            if (x.test(path)) {
                scribble.debug(`Blacklisted[${x}]: ${path}`);
                blacklists.inc(x,path);
                throw 'BLACKLIST';
            };
        });
        return await ctx.next();
   };
};


/**
 * @function cors injects cors headers for cross-site requests
 * @param {object} options
 * @return {object} nativeware
 */
nativeware.cors = function cors(options={}) {
    if (!options.origins) this.scribe.fatal("CORS handler must be defined as null or requires origins property");
    let allowedHosts = asList(options.origins);
    let headers = asStr(options.headers||'Authorization, Content-type');
    let methods = asStr(options.methods||'POST, GET, OPTIONS');
    let credentials = options.credentials===undefined ? true : !!options.credentials;
    return async function corsMW(ctx) {
        let origin = ctx.request.HEADERS['origin'] || '';
        if (!origin) {
            this.scribe.trace('No CORS origin request header specified, skipping...');
            return await ctx.next();
        };
        if (allowedHosts.includes(origin)) {
            this.scribe.trace('Adding CORS headers...');
            ctx.headers({
                'Access-Control-Allow-Origin': origin, 
                'Access-Control-Expose-Headers': '*'    // headers browser may expose to JavaScript
            });
            if (ctx.verbIs('options')) {    // preflight check
                ctx.headers({
                    'Access-Control-Allow-Methods': methods,
                    'Access-Control-Allow-Headers': headers,    // headers browser may send
                    'Access-Control-Allow-Credentials': credentials
                });
                return null;
            };
            return await ctx.next();
        } else {
            throw {code: 403, msg: `Unauthorized cross-site request for ${origin}`};
        };
    };
};


/**
 * @function logAnalytics records requested analytics
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.logAnalytics = function logAnalytics(options={}) {
    let scribble = this.scribe;
    let log = options.log===undefined ? ['ip','page','user'] : asList(options.log);
    scribble.info('Analytics nativeware initialized...');
    return async function logAnalyticsMW(ctx) {
        let [ip, path, usr] =[ctx.request.remote.ip, ctx.request.pathname, ctx.user.username||'-'];
        scribble.debug(`Analytics: ${ip} : ${path} : ${usr}`);
        log.forEach(a=>{
            if (a=='ip') analytics.inc('ip',ip);
            if (a=='page') analytics.inc('page',path);
            if (a=='user') analytics.inc('user',usr);
        });
        return await ctx.next();
   };
};


/**
 * @function login generates a JSON Web Token for user access authentication
 * @param {object} [options]
 * @return {object} nativeware
 * 
 */
nativeware.login = function login(options={}) {
    let self = this;
    let scribble = this.scribe;
    scribble.info(`Login nativeware initialized ...`);
    return async function loginMW(ctx) {
        scribble.trace(`Login${'@'+(self.authServer?self.authServer:'self')}: ${ctx.args.action} as ${ctx.user?.username}`);
        if (ctx.args.action=='logout') return {};
        if (!ctx.authenticated) throw 401;
        if (ctx.authenticated=='bearer' && !ctx.user.ext) throw { code: 401, msg: 'Token renewal requires login' };
        ctx.jwt = ctx.jwt || (ctx.user.other.account==='api' ? jwt.create(ctx.user,null,null) : jwt.create(ctx.user));
        ctx.headers({authorization: `Bearer ${ctx.jwt}`});
        return { token: ctx.jwt, payload: jwt.extract(ctx.jwt).payload };   // response: JWT (as token), and user data (payload)
    };
};


/**
 * @function content serves (static) content, including folder listing and file upload
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.content = function content(options={}) {
    let scribble = this.scribe;
    let { auth='', cache={}, compress:compressTypes, index='index.html', indexing, posts={}, root, route='', tag=this.tag } = options;
    let [ authGet, authPost ] = asList(auth,'|');
    cache.header = cache.header || 'max-age=600';
    if (auth && !cache.header.includes('private')) 
        scribble.warn(`Content[${tag}]: 'Cache-header' for authorized access should include 'private' setting`);
    compressTypes = asList(compressTypes||'css,csv,html,htm,js,json,pdf,txt');
    if (!root) throw `Content[${tag}] nativeware requires a root definition`;
    Object.keys(posts).forEach(p=>{if(!posts[p].root) throw {code:400, msg: `Site options.posts[${p}] requires 'root' property!`};})
    let theCache = new Cache(cache); // add pre-caching???
    scribble.info(`Content[${tag}] nativeware added for route '${route}' @ ${root}`);

    return async function contentMW(ctx) {
        scribble.trace(`Content[${tag}]: ${ctx.request.method} ${ctx.request.href}`);
        scribble.extra(`route[${ctx.routing.route.method}]: ${ctx.routing.route.route}`);
        if (!ctx.verbIs('get')) throw 405;
        if (authGet && !ctx.authorize(authGet)) throw 401;    // not authorized

        let base = ctx.request.pathname==='/' ? '/'+index : ctx.request.pathname;
        let fileSpec = decodeURI(resolveSafePath(root,base));
        let stats = await safeStat(fileSpec);
        //scribble.extra(`Content[${tag}]: ${fileSpec}, ${stats && stats.isDirectory() ? 'DIR' : 'FILE'}`);
        scribble.extra(`Content[${tag}]: ${fileSpec}, ${stats ? (stats.isDirectory() ? 'DIR' : 'FILE') : '???'}`);
        if (!stats || stats.isSymbolicLink()) return await ctx.next();  // not found (or found link), continue looking
        if (stats.isDirectory()) {
            if (!indexing) throw 403;
            ctx.headers({'Cache-control': 'no-cache'});
            return await listFolder(fileSpec,indexing===true?{}:indexing);
        };
        let newEntry = new FileEntry(fileSpec,{url: base, size: stats.size, time: stats.mtime});
        let oldEntry = theCache.getEntry(fileSpec);
        let inCache = oldEntry && oldEntry.matches(newEntry);
        ctx.headers({'Last-Modified': newEntry.modified});
        let since = ctx.request.HEADERS['if-modified-since'];
        if (since && (new Date(since)>=new Date(newEntry.modified)))  throw 304;    // not modified notice
        let etags = ctx.request.HEADERS['if-none-match'] || '';
        if (etags && newEntry.hasTagMatch(etags)) throw 304;    // not modified notice
        // not modified, and "if-..." header included then doesn't even load into cache...
        try {        
            if (!inCache) {
                let store = newEntry.size < theCache.max;
                let compress = compressTypes.includes(newEntry.ext);
                await newEntry.load(store,compress);
                theCache.addEntry(newEntry);
                oldEntry = newEntry;
            };
            ctx.headers({'Cache-Control': cache.header});
            // build return record
            let compressed = (ctx.request.HEADERS['accept-encoding'] || '').includes('gzip');
            let data = new ResponseContext(oldEntry.content(compressed));
            return data;
        } catch(e) { throw e; };
   };
};


// Export functions...
module.exports = nativeware;
