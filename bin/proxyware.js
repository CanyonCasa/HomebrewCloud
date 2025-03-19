/***
 * @module proxyware.js
 * This modules provides reverse proxy server support
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const pw = require('./proxyware');
 * 
 * 
 * TBD...
 *      JSDOCS
 */





///*************************************************************
/// Dependencies...
const exec = require('util').promisify(require('child_process').exec);
const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
const tls = require('tls');
const fs = require('fs');
const fsp = fs.promises;
const { blacklists, httpStatusMsg, Scribe, statistics } = require('./workers');
const WebSocketApp = require('./wsApp');

///*************************************************************
/// worker definitions...
let proxies = {};

// error handler and custom router logic...
let proxyRouter = (tag) => {
    var self = proxies[tag];
    self.proxy.on('error',(err,req,res)=>{
        self.scribble.error('Trapped internal proxy exception!:',err.toString());
        statistics.inc(self.tag,'errors');
        try {
            res.writeHead(500, "Oops!, Proxy Server Error!" ,{"Content-Type": "application/json"});
            res.write(JSON.stringify(httpStatusMsg({code: 500, msg: 'Oops!, Proxy Server Error!'})));
        } catch (e) {self.scribble.error('Exception handling Proxy Exception!:',e.toString())};
        try {
            res.end();
        } catch (e) {self.scribble.error('Exception terminating response!:',e.toString())};

    });
    return function router(req,res) {
        let [host, method, url] = [(req.headers.host||'').split(':')[0], req.method, req.url];
        let route = self.routes[host] || self.routes['*.' + host.substr(host.indexOf('.')+1)];
        let ip = req.headers['x-forwarded-for']||req.connection.remoteAddress||'?';
        if (route) {
            statistics.inc(self.tag,'served');
            self.scribble.debug(`Proxy ${ip} -> ${host} -> ${method} ${url} (${route.host}:${route.port})`);
            try {
                self.proxy.web(req, res, {target: route});
            } catch(e) {
                res.end(); // trap malformed (hacking) requests 
            };
        } else {
            let localIP = ip.match(/(?:192\.168|127\.\d+|10\.\d+|169\.254)\.\d+\.\d+$/);
            if (!localIP || self.cfg.verbose) { // ignore diagnostics for local addresses unless verbose
                let probes = statistics.inc(self.tag,'probes');
                let perIP = blacklists.inc(self.tag,ip);
                self.scribble.dump(`NO PROXY ROUTE[${probes},${perIP}]: ${ip} -> ${host}`);
            };
            res.end(); // invalid routes close connection!
        };
    };
};

// callback for updating ssl context for https servers
let sslContext = async function sslContext(tag) {
    self = proxies[tag] || {};
    if (!self.ssl) throw 'Required proxy secrets files (key/cert) not defined!';    // context cfg options
    try {
        if (self.ssl.changed) {
            for (let k in self.ssl.files) {
                self.scribble.log(`Loading TLS '${k}': ${self.ssl.files[k]}`);
                self.ssl.data[k] = await fsp.readFile(self.ssl.files[k], 'utf8');
            };
            self.ssl.changed = false;
            self.scribble.trace('Key/certificate files loaded...');
            let now = new Date().toISOString();
            let stdout = (await exec(`openssl x509 -noout -enddate -in ${self.cfg.ssl.cert}`)).stdout;
            let exp = new Date(stdout.replace(/.*=/,'').trim()).toISOString();
            self.scribble.info('SSL Certificate valid until:',exp);
            statistics.set('proxy',self.tag,{expires: exp, loaded: now, tag: self.tag});
            self.ssl.context = tls.createSecureContext(self.ssl.data);
            self.scribble.trace('SSL context created successfully!');
        };
    } catch (e) {
        self.scribble.error(`Secure Proxy[${self.tag}] key/certificate file error`); 
        self.scribble.error('#  ',e); 
        throw e;
    };
};


let Proxy = async function(config) {
    let tag = config.tag;
    let scribble = Scribe(tag);
    let pOptions = {ws: false, hostnameOnly: true, xfwd: true}.mergekeys(config.options);
    let proxy = httpProxy.createServer(pOptions);
    proxies[tag] = { 
        cfg: config, 
        db: config.db,
        isSecure: !!config.ssl, 
        proxy: proxy, 
        routes: config.routes, 
        scribble: scribble, 
        ssl: null, 
        tag: tag };
    statistics.set(tag,undefined,{errors: 0, probes: 0, served: 0});
    try {
        if (config.ssl) {   // build secure (i.e. https) context
            proxies[tag].ssl = {
                allowed: config.hosts,
                changed: true,
                context: {},    // must define after ssl defined
                data: {},       // loaded by sslContext
                files: config.ssl,
                options: { 
                    SNICallback: ((px)=>(host,cb)=>{
                        if (px.ssl.allowed.includes(host)) return cb(null,px.ssl.context);
                        return cb(400,null);    // bad request, host not allowed
                        })(proxies[tag])        // IIFE for closure of proxies[tag] as px
                }
            };
            await sslContext(tag);   // add context to proxy, later calls will update with SNICallback

            fs.watch(config.ssl.cert,evt=>{
                if (proxies[tag].ssl.changed) return;   // trigger only on first occurance of change
                if (evt!=='change') return;
                proxies[tag].ssl.changed = true;
                // give system time to copy all cert and key files before updating context...    
                setTimeout(()=>{sslContext(tag).catch(e=>console.error(e)); return},1000);
            });
            proxies[tag].server = https.createServer(proxies[tag].ssl.options,proxyRouter(tag));
        } else {    // build insecure (i.e. http) context
            proxies[tag].server = http.createServer(proxyRouter(tag));
        };
        // start web socket servers...
        if (config.sockets) {
            let socketRoutes = {}; // key: route, value: app
            config.sockets.mapByKey((cfg,key)=>{
                let scfg = {tag: key, route: '/'+key, topics: []}.mergekeys(cfg);
                let sApp = null;
                try { 
                    sApp = new (cfg.app ? require(cfg.app) : WebSocketApp)(scfg);
                    scribble.log(`Web socket[${sApp.appName}] configured for ${scfg.route}`);
                }
                catch(e) {
                    scribble.warn(`Failed to configure web socket app for ${key}: ${e.toString()}`);
                }
                if (sApp) socketRoutes[scfg.route] = sApp;
            });
            proxies[tag].socketRoutes = socketRoutes;
             // handle web sockets and start server
            proxies[tag].server.on('upgrade',async (req,socket,head) => {
                socket.on('error', console.error);
                socket.removeListener('error', console.error);
                let route = req.url.split('?')[0];
                let app = (route && route in proxies[tag].socketRoutes) ? proxies[tag].socketRoutes[route] : null;
                // handle upgrade for valid route and websocket server...
                if (app) {
                    req.hb = { route: route, proxy: proxies[tag] };
                    app.wss.handleUpgrade(req, socket, head, (ws)=>app.wss.emit('connection', ws, req));
                    scribble.trace(`Request upgraded to websocket @ ${route}`); 
                } else {
                    socket.destroy();
                };
            });
        };
        // start server...
        proxies[tag].server.listen(config.port);
        scribble.info(`${config.ssl?'SECURE ':''}Proxy initialized on port ${config.port}`); 
    } catch (e) { scribble.error(`Proxy (configuration): ${e.toString()}`); throw e; };
    return proxies[tag];
};

module.exports = {Proxy:Proxy, sslContext: sslContext};
