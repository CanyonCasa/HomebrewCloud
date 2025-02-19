/*
HomebrewCloud implements a single service app for cloud applications, 
specifically AWS Lightsail, although it should work with other cloud services.
It represents a simplified HomebrewDIY derivative that implements a single 
endpoint behind Apache on AWS Lightsail. It eliminates the reverse proxy, 
deligating that role to the Apache server installed with the Lightsail 
blueprint. See HomebrewCloud readme for setup details,as well as 
HomebrewDIY documentation for more operational details.
issued: 20240429 by CanyonCasa, (c)2024 Enchanted Engineering, Tijeras NM.

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
require('./Extensions2JS');   // personal library of additions to JS language, only required once
// require node dependencies...
const os = require('os');
const http = require('http');

// read the hosting configuration from (cmdline specified arg or default) JS or JSON file ...
const cfg = require(process.argv[2] || '../restricted/config');

// low level libraries; both helpers and workers MUST be called first from cloud.js for correct operation...
const { $VERSION, jxFrom, markTime} = require('./helpers');   // low level utility functions  
const { Scribe, sms, statistics } = require('./workers')(cfg.workers);  // high level (complex) functions
const scribe = Scribe(cfg.workers.scribe);  // main Scribe instance

const jxDB = require('./jxDB');             // simple JSON based database library
const { addUserCandy } = require('./authware');

// middleware libraries...
const serverware = require('./serverware');         // built-in server functions, request parser, router, and response handler, ...
const nativeware = require('./nativeware');         // application built-in middleware functions, including (static) content handler
const apiware = require('./apiware');            // Homebrew API middleware handler
// optional custom user middleware (highest precedence), defined as empty module if not found, overrides native and api functions
const customware = (()=>{ try { return require('./customware'); } catch (e) { return {}; }; })();   // IIFE


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
app.mergekeys({cfg: scfg, routes: [], tag: tag, db: {}});
(scfg.databases||{}).mapByKey((def,tag)=>{
    def.tag = def.tag || tag;       // ensure a defined tag
    scribe.trace(`Connecting db[${tag}] ...`);
    app.db[tag] = new jxDB(def);    // establish database
});
app.scribe = Scribe(tag);

// authentication setup required by auth & account middleware
app.authOptions = scfg.options===null ? null : scfg.options.auth===null ? null : scfg.options.auth;
app.authenticating = !!app.authOptions;
app.authServer = app.authOptions ? (typeof(app.authOptions)==='object' ? app.authOptions.url : app.authOptions) : null;
if (app.authenticating && !app.authServer && !app.db.users) app.scribe.fatal('Users database not found, required for authentication');
// add syntax candy to database prototype...
if (app.db.users) addUserCandy(app.db.users);

// build app handlers and routers...
let [appNativeware, appAPIware, appCustomware] = [nativeware, apiware, customware].map(w=>w.mapByKey(v=>typeof v=='function' ? v.bind(app) : v));  // bind f()'s to App scope
let { handlers=[], options={}, root } = app.cfg;
let { account={}, analytics, cors, login={} } = options===null ? { analytics: null, cors: null } : options;
function customizeRoute (cfg,defaultRoute) { cfg.route = cfg.route || defaultRoute || ''; return cfg; }
function addRoute (method,route,afunc) { serverware.addRoute(app.routes,method||'',route,afunc); };
// create and build middleware stack starting with priority built-in configurable features...
if (analytics!==null) addRoute('any','',appNativeware.logAnalytics(analytics));
if (cors!==null) addRoute('any','',appNativeware.cors(cors));
    // authentication setup required by auth & account middleware
if (app.authenticating) {
    if (!app.authServer) {
        customizeRoute(account, appNativeware.routes.account);
        addRoute('any',account.route,appNativeware.account(account));  // hardwired default route
    };
    customizeRoute(login, appNativeware.routes.login);
    addRoute('any',login.route,appNativeware.login(login));        // hardwired default route
};
// custom handlers specified by configuration...
handlers.forEach(h=>{
    let { code='', method='any', route='' } = h;
    let codeWare = appCustomware[code] ? appCustomware : appAPIware[code] ? appAPIware :
        appNativeware[code] ? appNativeware : null;
    //let codeWare = appCustomware[code] || appAPIware[code] || appNativeware[code] || null;
    if (codeWare) {
      customizeRoute(h,codeWare?.routes[h.code]);
      addRoute(method.toLowerCase(),h.route,codeWare[code](h));
	};
});
if (root) addRoute('get','',appNativeware.content({root:root}));  // default open static server, if site root defined

// start app service...
let prepRequest = serverware.defineRequestPreprocessor.call(app,app.cfg);
let sendResponse = serverware.defineResponseProcesser.call(app,app.cfg);
let handleError = serverware.defineErrorHandler.call(app,app.cfg);
try {
    http.createServer(async (req,res) => { // Instantiate the HTTP server with async request handler...
        // app code called for each http request...
        let ctx = serverware.createContext();                       // define context for the request response
        ctx.headers(app.cfg.headers);                       // append site specific headers to context
        try {                                               // wrap all processing to trap all errors
            await prepRequest(req,ctx);                     // parse request headers and body, optionally authenticate
            ctx.data = await serverware.router.call(app,ctx);       // route context through middleware chain, return data
            await sendResponse(ctx,res);                    // return response to client
        } catch(err) { await handleError(err,ctx,res); };   // handle any error that occurs
    }).listen(app.cfg.port);
    statistics.set('$',null,{code: 'HomebrewCloud', host: HOST, start: new Date().toISOString(), mode: MODE});
    scribe.info(`HomebrewCloud site setup complete: ${scfg.host}:${cfg.site.port}`);
    if (MODE==='production') sms({text:`HomebrewCloud service started on host ${HOST}`})
      .catch(e=>{scribe.log('sms failure!:',e); });
} catch(e) { 
    if (MODE=='production') sms({text:`HomebrewCloud service failed to started on host ${HOST}`})
      .catch(e=>{scribe.log('sms failure!:',e); });
    scribe.fatal(`HomebrewCloud App failed to start --> ${e.toString()}`) 
};
