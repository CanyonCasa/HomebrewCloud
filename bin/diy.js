/*
diy.js: HomebrewDIY implements a homebrew scratch multi-domain/multi-host web hosting service 
issued: 20201223 by CanyonCasa, (c)2020 Enchanted Engineering, Tijeras NM.

This script sets up a small multi-domain/multi-host NodeJS based web hosting service, which 
  1. Configures shared hosting context (AKA global or top level) and services such as transcripting and shared databases
  2. Configures and starts individual "site" apps/services
  3. Configures and starts reverse proxies to redirect requests to respective sites

SYNTAX:
  node diy [<configuration_file>]
  forever node diy [<configuration_file>]
  NODE_ENV=production node diy [<configuration_file>]
  NODE_ENV=production forever node diy [<configuration_file>]
  
  where <configuration_file> defaults to ../restricted/config[.js or .json] See documentation for assumed directory layout
*/


// load external dependencies...
require('./Extensions2JS');             // personal library of additions to JS language, only required once
// read the hosting configuration from (cmdline specified arg or default) JS or JSON file ...
const os = require('os');
const cfg = require(process.argv[2] || '../restricted/config');

// low level libraries; both helpers and workers MUST be called first from main code for correct operation...
const { $VERSION} = require('./helpers');   // low level utility functions  
const { Scribe, sms, statistics } = require('./workers')(cfg.workers);  // high level (complex) functions
const scribe = Scribe(cfg.workers.scribe);  // main Scribe instance

const jxDB = require('./jxDB');
const { addUserCandy } = require('./authware');
const pw = require('./proxyware');      // reverse proxy service methods
const app = require('./app');           // default site application

// message identifiers...
const VERSION = cfg.$VERSION || $VERSION;
const HOST = cfg.$HOST || os.hostname() || '???';
const MODE = process.env.NODE_ENV||'development'; // production or development
scribe.info(`HomebrewDIY[${VERSION}] setup on '${HOST}' in '${MODE}' mode...`);

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
shared.headers = {"x-powered-by": "Raspberry Pi NodeJS HomebrewDIY "+VERSION}.mergekeys(shared.cfg.headers)

// filter any sites listed as served by proxy from cfg that lack a site specific configuration and vice versa
let cfgdSites = Object.keys(cfg.sites); // i.e. have a configuration defintion
let proxiedSites = []; cfg.proxies.mapByKey(p=>proxiedSites=[...proxiedSites,...p.sites]);      // flat list of all sites
let activeSites = cfg.proxies.mapByKey(p=>p.sites).mapByKey(v=>v.filter(s=>s in cfg.sites));    // cfgd sites keyed by proxy
cfgdSites.filter(s=>!proxiedSites.includes(s)).forEach(s=>scribe.warn(`Site '${s}' configured but not proxied! `));
proxiedSites.filter(s=>!cfgdSites.includes(s)).forEach(s=>scribe.warn(`Site '${s}' proxied but not configured - removed!`));
activeSites.mapByKey((x,p)=>x.forEach(s=>scribe.log(`Site '${s}' configured and proxied by ${p}!`)));

// backend sites should start before proxies...
// prep each site configuration and start app for each proxied site that's defined...
scribe.debug("HomebrewDIY site setups...");
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

// define and start reverse proxy servers...
scribe.debug("HomebrewDIY proxy setup...");
Promise.all(
    Object.keys(activeSites).map(p=>{
    let pcfg = {tag: p, db: shared.db, routes: {}}.mergekeys(cfg.proxies[p]);  // shorthand site configuration
    scribe.log(`Creating proxy[${pcfg.tag}] context...`);
    activeSites[p].forEach(s=>{ // dynamically generate active site specific routes...
        let route = {host: cfg.sites[s].host, port: cfg.sites[s].port||(pcfg.ssl?443:80)};
        (cfg.sites[s].aliases||[]).forEach(a=>{ pcfg.routes[a] = route; 
            scribe.info(`Proxy[${p}] route added: ${a} --> ${route.host}:${route.port}`);});
    });
    return pw.Proxy(pcfg); })
).then(x=>{
    statistics.set('$',null,{code:'HomebrewDIY',host: HOST, start: new Date().toISOString(), mode: MODE});
    if (MODE=='production') sms({text:`HomebrewDIY Service started on host ${HOST}`})
        .catch(e=>{console.log('sms failure!:',e); });
    scribe.info("HomebrewDIY setup complete...");
}).catch(e=>{scribe.fatal(e)});
