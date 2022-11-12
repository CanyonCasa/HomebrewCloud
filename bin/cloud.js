/*
HomebrewCloud implements a single service app for cloud applications, 
specifically AWS Lightsail, although it should work with other cloud services.
It represents a simplified HomebrewDIY derivative that implements a single 
endpoint behind Apache on AWS Lightsail. It eliminates the reverse proxy, 
deligating that role to the Apache server installed with the Lightsail 
blueprint. See HomebrewCloud readme for setup details,as well as 
HomebrewDIY documentation for more operational details.
issued: 20221110 by CanyonCasa, (c)2022 Enchanted Engineering, Tijeras NM.

cloud.js: This script defines the backend app that implements a single host 
endpoint. Assumed operation behind https proxy, it includes most features of 
HomebrewDIY, except for the proxy and SSL certificate handling, including:
  * Authentication, authorization, login, and user account management
  * Request logging
  * Parsing for JSON, urlencoded, and simple multipart/form-data bodies 
    including basic file upload.
  * Configurable middleware for serving static content, data, microservices, ...
  * Response compression and streaming
  * Error handling
  * No external framework required

    Note: cloud.js essentially combines HomebrewDIY diy.js and app.js scripts,
    eliminates proxyWare.js, and greatly simplfies the config.js file as a 
    result.

SYNTAX (from within the bin folder):
  [NODE_ENV=production] [forever] node cloud [<configuration_file>]
  
  where <configuration_file> defaults to ../restricted/config[.js or .json] 
  See documentation for assumed directory layout and config file details.
*/


// load language extension dependencies first...
// personal library of additions to JS language, only required once
require('./Extensions2JS');

// read the hosting configuration from (cmdline specified arg or default) JS or JSON file ...
const cfg = require(process.argv[2] || '../restricted/config');
const { $VERSION } = require('./helpers');

// require node dependencies...
const os = require('os');
const http = require('http');

// require low level libraries
const jxDB = require('./jxDB');                     // simple JSON based database
const { jxFrom, markTime } = require('./helpers');  // low level utility functions

// middleware libraries...
const sw = require('./serverware');         // built-in server functions, request parser, router, and response handler, ...
const nw = require('./nativeware');         // application built-in middleware functions, including (static) content handler
const aw = require('./apiware');            // Homebrew API middleware handler
// optional custom user middleware (highest precedence), defined as empty module if not found, overrides native and api functions
const cw = (()=>{ try { return require('./customware'); } catch (e) { return {}; }; })();   // IIFE

// load and configure higher level service workers and merge configuration...
const { auth, jwt, mimeTypesExtend, Scribe, services, sms, statistics } = require('./workers');
auth.cfg.mergekeys(cfg.workers.auth);
jwt.cfg.mergekeys(cfg.workers.jwt);
mimeTypesExtend(cfg.workers.mimeTypes);
services({mail: cfg.workers.mail, text: cfg.workers.text});
const scribe = Scribe(cfg.workers.scribe);  // main Scribe instance

// message identifiers...
const VERSION = cfg.$VERSION || $VERSION;
const HOST = cfg.$HOST || os.hostname() || '???';
const MODE = process.env.NODE_ENV||'development'; // production or development
scribe.info(`HomebrewCloud[${VERSION}] setup on '${HOST}' in '${MODE}' mode...`);


///////////////////////////////////////////////////////////////////
// app code...
let app = {};
let scfg = cfg.site; // shorthand site configuration reference with default tag
let tag = scfg.tag || 'cloud';
scribe.debug(`HomebrewCloud site '${tag}' setup...`);

scfg.headers = {"x-powered-by": "HomebrewCloud "+VERSION}.mergekeys(scfg.headers);
let db = {};
scfg.databases.mapByKey((def,tag)=>{
    def.tag = def.tag || tag;      // ensure a defined tag
    db[tag] = new jxDB(def);       // establish database
});
app.mergekeys({cfg: scfg, tag: tag, db: db, scribe: Scribe(tag)});

// authentication setup required by auth & account middleware
app.authenticating = !(scfg.options===null || scfg.options?.auth === null);
if (app.authenticating && !db.users) scribe.fatal('Users database not found, required for authentication');
app.getUser = db.users ? (usr) => db.users.query('userByUsername',{username:usr.toLowerCase()}) : ()=>{};
app.chgUser = db.users ? (usr,data) => db.users.modify('changeUser',[{ref: usr, record: data}]) : ()=>{};

// build app handlers and routers...
let routeTable = app.routes;
let [anw, aaw, acw] = [nw, aw, cw].map(w=>w.mapByKey(v=>typeof v=='function' ? v.bind(app) : v));  // bind f()'s to App scope
function addRoute (method,route,afunc) { sw.addRoute(routeTable,method||'',route,afunc); };
let { handlers=[], options={}, root } = app.cfg;
let { account={}, analytics, cors, login } = options===null ? { analytics: null, cors: null } : options;
// create and build middleware stack starting with priority built-in configurable features...
if (analytics!==null) addRoute('any','',anw.logAnalytics(analytics));
if (cors!==null) addRoute('any','',anw.cors(cors));
if (app.authenticating) {
    addRoute('any',account.route||'/user/:action/:user?/:opt?',anw.account(account));
    addRoute('any','/:action(login|logout)',anw.login(login));
};
// custom handlers specified by configuration...
handlers.forEach(h=>{
    let { code='', method='any', route='' } = h;
    let codeWare = acw[code] || aaw[code] || anw[code] || null;
    if (codeWare) addRoute(method.toLowerCase(),route,codeWare(h));
});
if (root) addRoute('get','',anw.content({root:root}));  // default open static server, if site root defined

// start app service...
let prepRequest = sw.defineRequestPreprocessor.call(app,app.cfg);
let sendResponse = sw.defineResponseProcesser.call(app,app.cfg);
let handleError = sw.defineErrorHandler.call(app,app.cfg);
try {
    http.createServer(async (req,res) => { // Instantiate the HTTP server with async request handler...
        // app code called for each http request...
        let ctx = sw.createContext();                       // define context for the request response
        ctx.headers(app.cfg.headers);                       // append site specific headers to context
        try {                                               // wrap all processing to trap all errors
            await prepRequest(req,ctx);                     // parse request headers and body, optionally authenticate
            ctx.data = await sw.router.call(app,ctx);       // route context through middleware chain, return data
            await sendResponse(ctx,res);                    // return response to client
        } catch(err) { await handleError(err,ctx,res); };   // handle any error that occurs
    }).listen(app.cfg.port);
    statistics.set('$cloud',null,{host: HOST, start: new Date().toISOString(), mode: MODE});
    scribe.info(`HomebrewCloud site setup complete: ${scfg.host}:${cfg.site.port}`);
    if (MODE=='production') sms({text:`HomebrewCloud service started on host ${HOST}`})
      .catch(e=>{console.log('sms failure!:',e); });
} catch(e) { 
    if (MODE=='production') sms({text:`HomebrewCloud service failed to started on host ${HOST}`})
      .catch(e=>{console.log('sms failure!:',e); });
    scribe.fatal(`HomebrewCloud App failed to start --> ${e.toString()}`) 
};
