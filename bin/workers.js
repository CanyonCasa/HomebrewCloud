/***
 * @module workers.js
 * This modules provides high-level complex methods and declarations specific to applications
 * where workers are characterized as generally having dependencies, multiple actions, or logic.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const workers = require('./workers');
 * 
 * TBD...
 *      JSDOCS
 */





///*************************************************************
/// Dependencies...
require('./Extensions2JS');
const frmt = require('util').format;
const FS = require('fs').constants;
const fsp = require('fs').promises;
const path = require('path');
const qs = require('querystring');
const https = require('https');
const { asBytes, asList, asStyle, base64:x64, hmac, jxTo, pad, pluralize, print, uniqueID } = require('./helpers');
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');
const { resolve } = require('dns');


///*************************************************************
/// worker definitions...
var workers = {};   // container variable
var unsupported = async ()=>{ throw(501); };


///*************************************************************
/// Process error handling for graceful exit...
let cleanup = {
    callback: (code)=>scribe.write('','flush',[`Graceful exit[${code}]...`]), // default callback
    delay: 400,  
  };
let cleanupCalled = false;  // flag to prevent circular calls.
let gracefulExit = function (code=1) { // graceful exit call...
      if (!cleanupCalled) {
        cleanupCalled = true;
        cleanup.callback(code);  // do app specific cleaning once before exiting
        setTimeout(process.exit,cleanup.delay,code);  // no stopping!
      };
    };
  
  // catch clean exit ...
  process.on('beforeExit', function (code) { gracefulExit(code); });
  
  // catch forced exit ...
  process.on('exit', function (code) { gracefulExit(code); });
  
  // catch ctrl+c event and exit gracefully
  process.on('SIGINT', function () { gracefulExit(2); });
  
  //catch uncaught exceptions, trace, then exit gracefully...
  process.on('uncaughtException', function(e) { console.error('Uncaught Exception...\n',e.stack||e); gracefulExit(99); });

/**
 * @function cleanupProcess manages process exit operations for graceful exit; optional call for override
 * @param {} options - object for override of cleanup defaults
 * @param {function} [options.callback] - callback called on gracefull exit
 * @param {number} [options.delay] - callback called on gracefull exit
 * @return internal cleanup object for confirmation
 */
workers.cleanupProcess = (options={}) => { cleanup.mergekeys(options); return cleanup; };


///*************************************************************
/// Authentication code routines...

/**
 * @class auth provides routines to generate and check authentication codes and passwords
 * @function checkCode validates a challenge code and returns a true/false result
 * @param {string} challengeCode - code to be tested
 * @param {object} credentials - object with validation parameters: code, iat, expiration
 * @returns {boolean} - validation check state: true = valid code
 * @function checkPW validates a password against a hash
 * @param {string} pw - clear text password being tested
 * @param {object} hash - valid password bcrypt hash
 * @returns {boolean} - validation check state: true = valid password
 * @function genHashPW encrypts a password for storing
 * @param {string} pw - clear text password being encrypted
 * @returns {string} - encrypted password
 * @function genCode returns a unique code formatted per given parameters
 * @param {number} size - length of result, default 7
 * @param {number} base - modulo of the result: 10, 16, 36, default 10
 * @param {number} exp - expiration time in minutes, default 10
 * @return {object} - code object containing code, iat, and exp
 * @function getActivationCode returns an activation code formatted per configuration
 * @function getLoginCode returns an activation code formatted per configuration
 */
let cfgAuth = { activation: {size: 6, base: 10, expiration: 10}, login: {size: 7, base: 36, expiration: 10}, bcrypt_iterations: 11}
let auth = { 
    //cfg: { activation: {size: 6, base: 10, expiration: 10}, login: {size: 7, base: 36, expiration: 10}, bcrypt_iterations: 11},
    checkCode: (challengeCode,passcode) => {
        if (!passcode) return false;
        let expires = new Date((passcode.iat+passcode.exp)*1000);
        if (expires<new Date()) return false;
        return challengeCode===passcode.code; },
    checkPW: async (pw,hash) => await bcrypt.compare(pw,hash),
    genCode: (size=7,base=10,exp=10) => ({code: uniqueID(size,base), iat: new Date().valueOf()/1000|0, exp: exp*60}),
    genHashPW: async (pw) => await bcrypt.hash(pw,cfgAuth.bcrypt_iterations),
    getActivationCode: function() { 
        let { size, base, expiration } = cfgAuth.activation; 
        return auth.genCode(size, base, expiration); },
    getLoginCode: function() { 
        let { size, base, expiration } = cfgAuth.login;
        return auth.genCode(size, base, expiration); }
};
workers.auth = auth;


///*************************************************************
/// HTTP Error Messaging Service...
const httpCodes = {
    '200': "OK",                        // success messages
    '201': "Created",
    '202': "Accepted",
    '304': "Not Modified",              // Redirection messages
    '400': "Bad Request",
    '401': "NOT Authorized!",           // client errors
    '403': "Forbidden",
    '404': "File NOT found!",
    '405': "Method Not Allowed",
    '413': "Payload Too Large",
    '500': "Internal Server Error",     // server errors
    '501': "Not Supported",
    '503': "Service Unavailable"
};
/**
 * @function httpStatusMsg implements unified (JSON) error message formating for http server responses
 * @param {string|number|object} error - input error code
 * @return {{}} - object suitable for delivery as JSON
 */
workers.httpStatusMsg = error => {
    const validCode = (c) => Object.keys(httpCodes).includes(String(c));
    if (typeof error == 'object') { // internal error or standard error with detail msg
        let ext = { code: (('code' in error) && validCode(error.code)) ? Number(error.code) : 500 };
        ext.msg = httpCodes[String(ext.code)] + ('msg' in error  ? ` (${error.msg})` : '');
        ext.detail = ('detail' in error) ? print(error.detail,40) : !('msg' in error) ? print(error,60) : '';
        return ext;
    } else {    // some system responses or http error
        let c =  validCode(error) ? parseInt(error) : 500;
        let e = { error: c>399, code: c, msg: httpCodes[String(error)]||'UNKNOWN ERROR'};
        e.detail = e.msg=='UNKNOWN ERROR' ? print(error) : '';
        return e
    };
};


///*************************************************************
/// JSON Web Token handling...
/**
 * @class jwt provides JSON Web Token (JWT) functions
 * @function create defines a new JWT
 * @param {object} data - token data
 * @param {string} secret - encryption secret key, defaults to configured value of 256-bit unique value at startup
 * @param {number} expiration - time in seconds until JWT expires
 * @returns {object} a new JWT
 * @function expired checks if a JWT has expired
 * @param {number} expiration - time in seconds until JWT expires
 * @returns {boolean} true if expired
 * @function extract checks if a JWT has expired
 * @param {object} jwt - JWT string
 * @returns {object} JWT fields: header, payload, signature
 * @function verify checks validity of a JWT
 * @param {object} data - token data, accepts jwt string or jwt object (fields)
 * @param {string} secret - encryption secret key, defaults to configured value of 256-bit unique value at startup
 * @returns {object} JWT payload if valid, null if invalid
 */
let cfgJWT = {expiration: 60*24, secret: uniqueID(64,16), renewal: false}   // sets defaults
workers.jwt = {
    //cfg: {expiration: 60*24, secret: uniqueID(64,16), renewal: false},  // sets defaults
    create: (data,secret,expiration) => {
        // payload always includes 'initiated at' (iat) and expiration in minutes (exp), plus data
        let exp = expiration*60 || data.exp || cfgJWT.expiration*60;   // expiration in seconds
        let payload = Object.assign({},data,{ iat: new Date().valueOf()/1000|0, exp: exp, ext: cfgJWT.renewal});
        let encHeader = x64.j64u({alg: 'HS256',typ: 'JWT'});  // only support for HS256
        let encPayload = x64.j64u(payload);
        let signature = x64.b64u(hmac(encHeader+'.'+encPayload,secret||cfgJWT.secret));
        return [encHeader,encPayload,signature].join('.');
    },
    expired: (payload) => {  // accepts decoded payload object; returns true if expired
        let { exp, iat } = payload;   // initiated at and expiration times in seconds
        let expDate = new Date(1000*(iat + exp));
        return expDate < new Date();    // exp < now == false if not expired
    },
    extract: (jwt) => {
        let fields = (jwt+"..").split('.',3);
        return { header: x64.u64j(fields[0]), payload: x64.u64j(fields[1]), signature: fields[2] };
    },
    verify: (jwt,secret) => { // accepts jwt token string; returns true if valid
        let [ header, payload, signature ] = (jwt+"..").split('.',3);   // encoded fields
        let chkSignature = x64.b64u(hmac(header+'.'+payload,secret||cfgJWT.secret));
        let payloadData = x64.u64j(payload);
        let expired = workers.jwt.expired(payloadData);
        return (signature===chkSignature) && !expired ? payloadData : null;
    }
};


///*************************************************************
/// Directory/folder/file (i.e. files system objects, FSO) listing function
/**
 * @function safeAccess safely stats a file system object without throwing an error (null)
 * @param {string} spec - folder or file to stat
 * @param {object} [lnks] - follows links as files and directories if true, else as links (ignored)
 * @return {object} stats for the given file system object
 */

let safeAccess = async (spec,flgs) => { 
    let flags = {f:FS.F_OK, r:FS.R_OK, w:FS.W_OK, x:FS.X_OK };
    let fx = (flgs||'').split('').map(f=>flags[f]).reduce((a,c)=>a|c,flags.f);
    try { return await fsp.access(spec,fx) } catch(e) { return null; }; };
///*************************************************************
/// Directory/folder/file (i.e. files system objects, FSO) listing function
/**
 * @function safeStat safely stats a file system object without throwing an error (null)
 * @param {string} spec - folder or file to stat
 * @param {object} [lnks] - follows links as files and directories if true, else as links (ignored)
 * @return {object} stats for the given file system object
 */
async function safeStat(spec,lnks) { try { return await (lnks?fsp.stat(spec):fsp.lstat(spec)) } catch(e) { return null; }; };
/**
 * @function listFolder recursively scans a directory folder and lists files and folders and their basic stats
 * @param {string} dir - folder to scan
 * @param {object} [options] - listing options
 * @info options include, location: prefix for listing location, default '/', flat: flat listing flag (files only when true),
 *  links: flag to follow links when true
 * @return {object} hierarchical or flat folder listing of files and subfolders contents and their details (i.e. stats)
 */
async function listFolder(dir, options={}) {
    let listing = [];
    let location = options.location===undefined ? '/' : options.location;
    let recursive = options.recursive===undefined ? true : !!options.recursive;
    try {
        let fsoListing = await fsp.readdir(dir);
        for (let f in fsoListing) {
            let name = fsoListing[f]
            let spec = path.resolve(dir,name);
            let stats = await safeStat(spec,options.links);
            let fso = !stats || stats.isSymbolicLink() ? null :
              { location: location+name, name: name, size:stats.size, time: stats.mtime, 
                type: stats.isFile()?'file':stats.isDirectory()?'dir':stats.isSymbolicLink()?'link':'unknown' };
            if (fso) {
                if (fso.type == 'dir' && !recursive) continue;
                if (fso.type == 'dir') {
                    fso.listing = await listFolder(spec,options.mergekeys({location: fso.location+'/', recursive: recursive}));
                    if (options.flat) { listing = [...listing, ...fso.listing]; continue; };
                };
                if (fso.type!=='unknown' || options.unknown) listing.push(fso);
            };
        };
        return listing;
    } catch (e) { return e; };
};
workers.safeAccess = safeAccess;
workers.safeStat = safeStat;
workers.listFolder = listFolder;


///*************************************************************
/// Email Messaging Service...
let cfgSendgrid = null;

const mailRequest = (payload) =>({
    protocol: 'https:',
    hostname: 'api.sendgrid.com',
    method: 'POST',
    path: '/v3/mail/send',
    headers: {
        'Authorization': `Bearer ${cfgSendgrid.key}`,
        'Content-type': 'application/json',
        'Content-Length': Buffer.from(payload).byteLength
    }
});
const mailSend = function(msg) {
    let payload = JSON.stringify(msg);
    let rqst = mailRequest(payload);
    return new Promise((resolve,reject)=>{
        let req = https.request(rqst,res=>{
            let body = '';
            res.on('data',d=>{body +=d});
            res.on('end', (x)=>{ resolve({report: res, id: res.headers['x-message-id'], body: body, 
                status: {msg: res.statusMessage, code: res.statusCode}, headers: res.headers, x: x}); });
        });
        req.on('error',(e)=>resolve({report: null, error: e}));
        req.end(payload);
    });
};

/**
 * @function mail sends a mail message via Sendgrid, throws an error if Sendgrid module not configured
 * @param {object} msg - email message object containing addresses and body
 * @param {string} msg.to - optional address list (string or array), at least one must be defined
 * @param {string} msg.cc - optional address list
 * @param {string} msg.bcc - optional address list
 * @param {string} msg.from - optional from address, defaults to configuration
 * @param {string} msg.subject - optional subject line, defaults to configuration
 * @param {string} msg.text - plain text message,
 * @param {string} msg.html - alternate email HTML formatted text message, 
 * @param {object} msg.body - alternate email content object {type: ..., value: ...}, 
 * @return {} - object containing a summary report and transcript of action
 */
// email service wrapper assumes msg provides valid 'to,cc,&bcc addresses' and a 'body/text/html'
workers.mail = async function mail(msg) {
    if (!cfgSendgrid) throw 503;
    let sender = cfgSendgrid.validatedSenders.includes(msg.from) ? msg.from : cfgSendgrid.validatedSenders[0];
    let mmsg = { from: {email: sender}, subject: msg.subject||msg.subj||cfgSendgrid.subject, content: [] };
    if (msg.text) mmsg.content.push({type: 'text/plain', value: msg.text});
    if (msg.html) mmsg.content.push({type: 'text/html', value: msg.html});
    if (msg.body && typeof msg.body=='object') mmsg.content.push(msg.body);
    if (!mmsg.content.length) mmsg.content.push({type: 'text/plain', value: cfgSendgrid.text||'No content'});
    let addr = {to: asList(msg.to), cc: asList(msg.cc), bcc: asList(msg.bcc)}.filterByKey(lst=>lst.length);
    if ([].concat(addr.to||[]).concat(addr.cc||[]).concat(addr.bcc||[]).length===0) addr.to = [cfgSendgrid.to];
    let addrStr = Object.keys(addr).reduce((a,k)=>a.concat(addr[k]),[]).join(', ');
    mmsg.personalizations = [addr.mapByKey(a=>a.map(r=>({email:r})))];
    let summary = { msg: `MAIL[${mmsg.subject}] sent to: ${addrStr}` };
    try {
        let {response,body,status,headers} = await mailSend(mmsg);
        status.detail = "SendGrid Response"
        let rpt = { body, status, headers };
        return { response: msg.verbose?response:undefined, report: rpt, error: status.code>=400?status:false, msg: mmsg, summary: summary };
    } catch(e) { return {error: e, response: msg.verbose?response:undefined, report: rpt, msg: mmsg, summary: summary } };
};


///*************************************************************
/// mime-types lookup ...
let mimes = { // define most common mimeTypes, extend/override with configuration
    'bin': 'application/octet-stream',
    'css': 'text/css', 
    'csv': 'text/csv', 
    'gz': 'application/gzip',
    'gif': 'image/gif',
    'htm': 'text/html',
    'html': 'text/html',
    'ico': 'image/vnd.microsoft.icon',
    'jpg': 'image/jpeg',
    'js': 'text/javascript',
    'json': 'application/json', 
    'md': 'text/markdown',
    'mpg': 'video/mpeg',
    'png': 'image/png', 
    'pdf': 'application/pdf', 
    'txt': 'text/plain',
    'xml': 'application/xml'
};
let mimeTypesExtend = (mimeDefs={}) => {
    mimes.mergekeys(mimeDefs);
    Object.keys(mimes).map(e=>mimes[mimes[e]]=e);   // add keys for applications for reverse lookup of extensions
    return mimes;
};

/**
 * @function mimeType returns the mime-type for a given extension or vice versa
 * @param {string} mime - lookup key
 * @param {*} fallback - default lookup
 * @return {string} - mime-type for extension or extension for mime-type
 */
workers.mimeType = (mime) => mimes[mime.replace('.','')] || mimes['bin'];   // application/octet-stream fallback


///*************************************************************
// scribe  i.e. application logger, singleton object (worker)...
var scribe = {
    tag: 'scribe',
    transcript: {
        file: 'scribe.log',
        bsize: 10000,
        fsize: 100000
    },
    buffer: '',
    busy: false,
    verbose: false,
    mask: lvl => { if (scribe.levels.includes(lvl)) scribe.level = scribe.rank(lvl); return scribe.levels[scribe.level]; },
    label: 'SCRIBE  ',  // tag formatted for output
    level: 3,           // rank equivalent for defined mask
    // note levels, styles, and text must track
    levels: ['dump', 'trace', 'debug', 'log', 'info', 'warn', 'error', 'fatal', 'note', 'flush'],
    rank: lvl => scribe.levels.indexOf(lvl),
    styles: [['gray','dim'], ['magenta','bold'], ['cyan','bold'], ['white'], ['green'], ['yellow','bold'], 
        ['red','bold'], ['bgRed','white','bold'], ['gray'], ['bgCyan','black']],
    text: ['DUMP ', 'TRACE', 'DEBUG', 'LOG  ', 'INFO ', 'WARN ', 'ERROR', 'FATAL', 'NOTE ', 'FLUSH'],
    toTranscript: function(text,flush) {
        scribe.buffer += text + (flush ? '\n\n' : '\n');    // extra linefeed for "page-break" when flushing
        if ((scribe.buffer.length>scribe.transcript.bsize) || flush) 
          scribe.saveTranscript().catch(e=>{ console.error(`Transcripting ERROR: ${e.message||e.toString()}`); });
    },
    saveTranscript: async function() {
        if (scribe.busy) return;       // already in process of saving transcript, just buffer new input
        scribe.busy = true;
        let tmp = scribe.buffer;
        scribe.buffer = '';
        let stat = {};
        try { stat = await fsp.stat(scribe.transcript.file); } catch(e) {};   // undefined if not found
        if ((stat.size+tmp.length)>scribe.transcript.fsize) {   // roll the transcript log on overflow
            let dx = new Date().style('stamp','local');
            let parts = path.parse(scribe.transcript.file);
            let bak = path.normalize(parts.dir + '/' + parts.name +'-' + dx + parts.ext);
            await fsp.rename(scribe.transcript.file,bak);     // rename log to backup
            scribe.write(scribe.label,'trace',[`Rolled log: ${bak} [${stat.size}]`]);
        };
        await fsp.writeFile(scribe.transcript.file,tmp,{encoding:'utf8',flag:'a'});   // write tmp buffer to transcript file
        scribe.busy=false;
    },
    write: function(label,level,args) {
        let stamp = new Date().style('iso','local');
        let rank = scribe.rank(level);
        let msg = frmt.apply(this,args);
        let prefix = [stamp,scribe.text[rank],label||scribe.label].join(' ') + ' ';
        let lines = frmt.apply(this,args).replace(/\n/g,'\n'+' '.repeat(prefix.length));  // break msg lines and add blank prefix
        if (rank >= scribe.level || level=='note') console.log(asStyle(scribe.styles[rank],prefix + lines));
        if (level!='note') scribe.toTranscript(prefix + msg.replace(/\n/g,'|'), level=='fatal'||level=='flush');
    }
};
scribe.mask('log'); // default level

// scribe instance object prototype
const scribePrototype = {
    mask: scribe.mask,
    dump: function(...args) { if (scribe.verbose) scribe.write(this.label,'dump',args) },   // always transcript only, no console output
    trace: function(...args) { scribe.write(this.label,'trace',args) },
    debug: function(...args) { scribe.write(this.label,'debug',args) },
    log: function(...args) { scribe.write(this.label,'log',args) },
    info: function(...args) { scribe.write(this.label,'info',args) },
    warn: function(...args) { scribe.write(this.label,'warn',args) },
    error: function(...args) { scribe.write(this.label,'error',args) },
    fatal: function(...args) { scribe.write(this.label,'fatal',args); process.exit(100); },     // always halts program!
    note: function(...args) { scribe.write(this.label,'note',args) },   // always to console (only), no transcript output
    flush: function(...args) { scribe.write(this.label,'flush',args) }  // flush, always writes transcript to empty the buffer
};

/**
 * @function scribe creates transcripting instances from scribe prototype
 * @param {object} config - main configuration, overrides defaults
 * @param {string} config - tag name reference for scribe instances, (8 character max) 
 */
workers.Scribe = function Scribe(config={}) {
    if (typeof config !== 'string') {   // then override any defaults with defined values of object
        scribe.tag = config.tag || scribe.tag;
        scribe.verbose = config.verbose || scribe.verbose;
        scribe.mask(config.mask);
        scribe.transcript = ({}).mergekeys(scribe.transport).mergekeys(config.transcript||{});
    };
    let tag = (typeof config == 'string') ? config : scribe.tag;
    return Object.create(scribePrototype).mergekeys({
        tag: tag,
        file: scribe.transcript.file,
        label: pad(tag.toUpperCase(),8)
    });
};

///*************************************************************
// define external services...

/// SMS Text Messaging service...
let cfgTwilio = null;
const prefix = (n)=>n && String(n).replace(/^\+{0,1}1{0,1}/,'+1'); // phone number formatting helper to prefix numbers with +1
/**
 * @function sms sends a text message via Twilio, throws an error if Twilio module not installed
 * @param {{}} msg - message object containing numbers list and text
 * @param {[]} [msg.numbers] - optional list of numbers,array or comma delimited string, default to cfgTwilio.admin 
 * @param {string} msg.body - required message text, alternate msg.text
 * @return {{}} - object containing a summary report and queue of action
 */
const smsPrefix = (n)=>n && String(n).replace(/^\+{0,1}1{0,1}/,'+1'); // prefix phomne numbers with +1
const smsRequest = (payload) =>({
    protocol: 'https:',
    hostname: 'api.twilio.com',
    method: 'POST',
    path: '/2010-04-01/Accounts/'+cfgTwilio.accountSID+'/Messages.json',
    auth: cfgTwilio.accountSID+':'+cfgTwilio.authToken,
    headers: {
        'Content-type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.from(payload).byteLength
    }
});
const smsSend = function(msg) {
    let payload = qs.stringify(msg);
    let rqst = smsRequest(payload);
    return new Promise((resolve,reject)=>{
        let req = https.request(rqst,res=>{
            let body = '';
            res.on('data',d=>{body +=d});
            res.on('end', ()=>resolve(jxTo(body,{})));
        });
        req.on('error',(e)=>reject(e));
        req.end(payload);
    });
};

// msg: { contact (for callback), numbers||to, [callback], body||text } => queue of reports and summary msg
workers.sms = async function sms(msg) {
    if (!cfgTwilio) throw 503;
    // convert numbers to list, prefix, filter invalid and duplicates
    let contact = (cfgTwilio.callbackContacts[msg.contact]||[]);
    let numbers = asList(msg.numbers||msg.to||contact||cfgTwilio.admin).map(p=>smsPrefix(p)).filter((v,i,a)=>v && (a.indexOf(v)==i));
    const cb = msg.callback || cfgTwilio.callback || null; // optional server acknowledgement
    let queue = await Promise.all(numbers.map(n => {
        let txt = {To: n, From: cfgTwilio.number, Body: msg.body||msg.text, statusCallback:cb};
        return new Promise(resolve => {
            smsSend(txt)
                .then(mr=>{ resolve({ report: mr, msg: txt, summary: { id:mr.sid, msg:`Text message queued to: ${n} as ${mr.sid}` }}); })
                .catch(e=>{ resolve({ report: null, msg: txt, error: e, summary: { msg:`Text message to: ${n} failed` }}); });
        });
    }));
    return queue;
};

class Internals {

    constructor() {
        this.data = {};
    }

    /**
     * @function get retrieves internal data by tag and key
     * @param {string} [tag] - first level identifier; may be undefined to retrieve all data under
     * @param {string} [key] - second level identifier; may be undefined to retrieve a whole branch
     * @return {*} - data as stored, which may be undefined as specified
     */
    get(tag, key) {
        if (tag===undefined) return this.data;
        if (tag in this.data) {
            if (key===undefined) return this.data[tag];
            if (key in this.data[tag]) return this.data[tag][key];
        };
        return undefined;
    }

    /**
     * @function set assigns a give value to a tag and key
     * @param {string} tag - first level identifier
     * @param {string} key - second level identifier; may be undefined to assign a whole branch
     * @param {*} value - data assigned to internal
     * @return {*} - internal value
     */
    set(tag, key, value) {
        this.data[tag] = (tag in this.data) ? this.data[tag] : {};     // verify existance of tag object or create
        if (key===undefined || key===null) {            // value may be an object (i.e. branch) to store directly
            this.data[tag] = value;
            return this.data[tag]; 
        };
        this.data[tag][key] = value;
        return this.data[tag][key];
    }
  
    /**
     * @function inc increments a statistic, or defines it if it does not exist
     * @param {string} tag - first level identifier; required
     * @param {string} key - second level identifier; required
     * @return {*} - updated data value
     */
    inc(tag, key) {
        let value = this.get(tag,key);
        this.set(tag, key, value ? value+1 : 1);
        return this.get(tag,key);
        }

    /**
     * @function refs retrieves a list of tags or keys
     * @param {string} [tag] - undefined retrieves all data tags; or all keys for a defined tag 
     * @return {[]} - list of tags or keys
     */
    refs(tag) { return tag ? Object.keys(this.data[tag]) : Object.keys(this.data) }

    /**
     * @function clear a statistic specified by tag and key or a branch specified by tag
     * @param {string} [tag] - first level identifier; may be undefined to clear all object data
     * @param {string} [key] - second level identifier; may be undefined to clear a whole branch
     * @return {*} - undefined
     */
    clear(tag, key) { tag ? (key ? delete this.data[tag][key] : delete this.data[tag]) : Object.keys(this.data).forEach(k=>delete this.data(k)) }
}

workers.analytics = new Internals();
workers.blacklists = new Internals();
workers.logins = new Internals();
workers.statistics = new Internals();

workers.logins.log = function log(usr, tag, err) {
    usr = usr || 'unknown';
    workers.logins.set(usr,tag,new Date().toISOString());
    if (tag.startsWith('fail')) {
        let mark = workers.logins.get(usr, 'mark');
        if (mark==undefined) {
            workers.logins.set(usr, 'mark', new Date().toISOString());
            mark = workers.logins.get(usr, 'mark');
        };
        if (+new Date() < (+new Date(mark) + 10*60*1000)) {
            if (workers.logins.inc(usr, 'count') > 3) {
                workers.logins.set(usr, 'mark', new Date().toISOString());
                throw {code: 401, msg: 'Too many login attempts; Account locked for 10 minutes!'};
            };
        } else {
            workers.logins.set(usr, 'mark', new Date().toISOString());
            workers.logins.set(usr, 'count', 1);
        };
        if (err) throw err;
    } else {
        workers.logins.clear(usr,'count');
        workers.logins.clear(usr,'mark');
    };
};

module.exports = function configure(cfg={}) {
    if ((typeof cfg=='object') && cfg!==null) {
        if (cfg.auth) cfgAuth.mergekeys(cfg.auth);
        if (cfg.jwt) cfgJWT.mergekeys(cfg.jwt);
        mimeTypesExtend(cfg.mimeTypes); // must be called with or w/o configuration
        if (cfg.sendgrid || cfg.mail) {
            cfgSendgrid = cfg.sendgrid || cfg.mail;
            cfgSendgrid.validatedSenders = asList(cfgSendgrid.from);
            sgMail.setApiKey(cfgSendgrid.key);
        };
        if (cfg.twilio || cfg.text) cfgTwilio = cfg.twilio || cfg.text;
    }
    module.exports = workers;
    return workers;
}
