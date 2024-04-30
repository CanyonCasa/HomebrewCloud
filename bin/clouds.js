/*
HomebrewClouds implements multiple service app for cloud applications, 
specifically AWS Lightsail, although it should work with other cloud services.
It represents a simplified HomebrewDIY derivative that implements  
endpoints behind Apache on AWS Lightsail. It eliminates the reverse proxy, 
deligating that role to the Apache server installed with the Lightsail 
blueprint. See HomebrewCloud readme for setup details,as well as 
HomebrewDIY documentation for more operational details.
issued: 20240429 by CanyonCasa, (c)2024 Enchanted Engineering, Tijeras NM.

clouds.js: This script defines the backend app that implements a single host 
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

    Note: clouds.js essentially combines diy.js and cloud.js scripts,
    eliminates proxyWare.js, It expects the config file to have a "sites" 
	section like diy.js vs the "site" section for cloud.js

SYNTAX (from within the bin folder):
  [NODE_ENV=production] [forever] node clouds [<configuration_file>]
  
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
const { $VERSION } = require('./helpers');  // low level utility functions  
const { Scribe, sms, statistics } = require('./workers')(cfg.workers);  // high level (complex) functions
const scribe = Scribe(cfg.workers.scribe);  // main Scribe instance

const jxDB = require('./jxDB');             // simple JSON based database library
const { addUserCandy } = require('./authware');

// middleware libraries...
const serverware = require('./serverware'); // built-in server functions, request parser, router, and response handler, ...
const nativeware = require('./nativeware'); // application built-in middleware functions, including (static) content handler
const apiware = require('./apiware');       // Homebrew API middleware handler
// optional custom user middleware (highest precedence), defined as empty module if not found, overrides native and api functions
const customware = (()=>{ try { return require('./customware'); } catch (e) { return {}; }; })();   // IIFE

// message identifiers...
const VERSION = cfg.$VERSION || $VERSION;
const HOST = cfg.$HOST || os.hostname() || '???';
const MODE = process.env.NODE_ENV||'development'; // production or development
scribe.info(`HomebrewCloud[${VERSION}] setup on '${HOST}' in '${MODE}' mode...`);

///////////////////////////////////////////////////////////////////
// shared resources...
// configure shared context passed to sites...
let shared = { cfg: {databases:{},headers:{}}.mergekeys(cfg.shared), db: {}, headers: {} };
// load shared databases...
shared.cfg.databases.mapByKey((def,tag)=>{
    def.tag = def.tag || tag;           // ensure a defined tag
    shared.db[tag] = new jxDB(def);     // establish database
});
// add syntax candy to database prototype...
if (shared.db.users) addUserCandy(shared.db.users);

// default headers; a configured "x-powered-by" header overrides builtin...
shared.headers = {"x-powered-by": "Raspberry Pi NodeJS HomebrewCloud "+VERSION}.mergekeys(shared.cfg.headers)

///////////////////////////////////////////////////////////////////
// backend app calls...
// prep each site configuration and start app for each proxied site that's defined...
scribe.debug("HomebrewClounds site setups...");
let activeSites = cfg.sites || {site: cfg.site};
let siteApps = activeSites.mapByKey((sites,proxy)=>{
    sites.map(s=>{
        let scfg = {tag: s}.mergekeys(cfg.sites[s]); // shorthand site configuration reference with default tag
        let context = { cfg: scfg, secure: !!cfg.proxies[proxy].ssl, shared: shared, tag: scfg.tag };
        let siteApp;
        if (scfg.app) {
            try {
                siteApp = new (require(scfg.app))(context); // starts app as cfgd.
            } catch(e) {
                scribe.error(`Failed to start app ${scfg.app} configured for ${scfg.tag}`);
                return null;
            }
        } else {
             siteApp = new app(context); // default basic app
        }
        scribe.info(`${context.secure?'Secure':'Insecure'} Site[${scfg.tag}]: initialized, hosting ${scfg.host}:${scfg.port}`);
        return siteApp;
    });
});

scribe.info("HomebrewClouds setup complete...");
