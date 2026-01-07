/*
 * HomebrewDIY backend baseline app (operating behind an https proxy) with built-in support for ...
 *  - Authentication, authorization, login, and user account management
 *  - Request logging
 *  - Parsing for JSON, urlencoded, and simple multipart/form-data bodies with file upload
 *  - Configurable middleware for serving static content, data, microservices, ...
 *  - Response compression and streaming
 *  - Error handling
 *  - No external framework required
 */

// dependencies...
const http = require('http');
const { Scribe } = require('./workers');    // higher level service workers
const jxDB = require('./jxDB');
const { addUserCandy } = require('./authware');

// middleware libraries...
const serverware = require('./serverware'); // built-in server functions, request parser, router, and response handler, ...
const nativeware = require('./nativeware'); // application built-in middleware functions, including (static) content handler
const apiware = require('./apiware');       // Homebrew API middleware handler
// optional custom user middleware (highest precedence), defined as empty module if not found, overrides native and api functions
const customware = (()=>{ try { return require('./customware'); } catch (e) { return {}; }; })();   // IIFE

/**
 * @module App constructor for basic HomebrewDIY application
 * @param {object} context - site specific context (setup options and diy shared context) passed from diy script
 * @return App server object
 */
function App(context) {
    // context: { cfg: {...}, secure: <boolean>, shared: {db:{...}, headers:{...}}, tag: <string> }
    this.mergekeys({cfg: context.cfg, isSecure: context.secure, routes: [], shared: context.shared, tag: context.tag});
    this.scribe = Scribe(context.tag);
    this.db = context.shared.db.mapByKey(connection=>connection);   // reference any shared db conections, can't be merged
    (context.cfg.databases||{}).mapByKey((def,tag)=>{ def.tag = def.tag || tag; this.db[tag] = new jxDB(def); }); // add new db's
    // authentication setup required by auth & account middleware
    this.authOptions = (context.cfg?.options===null || context.cfg?.options?.auth===null) ? null : (context.cfg?.options?.auth || {});
    this.authenticating = !!this.authOptions ;
    this.authServer = this.authOptions ? (typeof(this.authOptions)==='object' ? this.authOptions.url : this.authOptions) : null;
    if (this.authenticating && !this.authServer && !this.db.users) this.scribe.fatal('Users database not found, required for authentication');
    if (this.db.users) addUserCandy(this.db.users);
    this.build();       // build route table...
    this.start();       // start the server...
    this.scribe.debug(`HomebrewDIY/HomebrewCloud App initialized`);
};

/**
 * @function build defines the appplication specific route table for processing requests
 */
App.prototype.build = function() {
    let routeTable = this.routes;
    let [appNativeware, appAPIware, appCustomware] = [nativeware, apiware, customware].map(w=>w.mapByKey(v=>typeof v=='function' ? v.bind(this) : v));  // bind f()'s to App scope
    let { handlers=[], options={}, root } = this.cfg;
    let { account={}, analytics, blacklist, cors, login={} } = options===null ? { analytics: null, cors: null } : options;
    function customizeRoute (cfg,defaultRoute) { cfg.route = cfg.route || defaultRoute || ''; return cfg; }
    let addRoute = (method,route,afunc,tag) => { 
        serverware.addRoute(routeTable,method||'',route,afunc);
        this.scribe.trace(`addRoute[${tag}]: ${method} @ '${route}'`)
    };
    // create and build middleware stack starting with priority built-in configurable features...
    if (analytics!==null) addRoute('any','',appNativeware.logAnalytics(analytics),'analytics');   // all routes
    if (blacklist) addRoute('any','',appNativeware.blacklistCheck(blacklist));
    if (cors!==null) addRoute('any','',appNativeware.cors(cors),'cors');                     // all routes
    if (this.authenticating) {
        this.scribe.trace(`Authenticating: (${this.authServer||'self'})`)
        if (!this.authServer) {
            customizeRoute(account, appNativeware.routes.account);
            addRoute('any',account.route,appNativeware.account(account),'account');  // hardwired default route
        };
        customizeRoute(login, appNativeware.routes.login);
        addRoute('any',login.route,appNativeware.login(login),'login');        // hardwired default route
    } else {
        this.scribe.warn(`NO Authentication!`);
    };

    // custom handlers and routes specified by configuration...
    for (let h of handlers) {
        let { code='', method='any', route='' } = h;
        //let codeWare = appCustomware[code] || appAPIware[code] || appNativeware[code] || null;
        let codeWare = appCustomware[code] ? appCustomware : appAPIware[code] ? appAPIware : 
            appNativeware[code] ? appNativeware : null;
        if (codeWare) {
            customizeRoute(h,codeWare?.routes[h.code]);
            addRoute(method.toLowerCase(),h.route,codeWare[code](h),code);
        };
    };
    if (root) addRoute('get','',appNativeware.content({root:root}),'root');  // default open static server, if site root defined
};

/**
 * @function start defines the http server
 */
App.prototype.start = function start() {
    try {
        let siteHeaders = {}.mergekeys(this.shared.headers).mergekeys(this.cfg.headers); // merge server and site headers
        let prepRequest = serverware.defineRequestPreprocessor.call(this,this.cfg);
        let sendResponse = serverware.defineResponseProcesser.call(this,this.cfg);
        let handleError = serverware.defineErrorHandler.call(this,this.cfg);
    try {
        http.createServer(async (req,res) => { // Instantiate the HTTP server with async request handler...
            // this code called for each http request...
            let ctx = serverware.createContext();                   // define context for the request response
            ctx.headers(siteHeaders);                               // append site specific headers to context
            try {                                                   // wrap all processing to trap all errors
                await prepRequest(req,ctx);                         // parse request headers and body, optionally authenticate
                ctx.data = await serverware.router.call(this,ctx);  // route context through middleware chain, return data
                await sendResponse(ctx,res);                        // return response to client
            } catch(err) { await handleError(err,ctx,res); };       // handle any error that occurs
        }).listen(this.cfg.port);
        this.scribe.info(`HomebrewDIY App running on ${this.cfg.host}:${this.cfg.port}`);
    } catch(e) { this.scribe.fatal(`HomebrewDIY App failed to start --> ${e.toString()}`) };
    } catch(e) { this.scribe.fatal(`HomebrewDIY App processing setup failure --> ${e.toString()}`) };
};


module.exports = App;
