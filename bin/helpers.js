/***
 * @module helpers.js
 * This modules provides low-level utility functions and declarations for JavaScripts apps
 * where helpers generally implement singular actions that have no dependencies, callback, and such 
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const helpers = require('./helpers');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const URL = require('url').URL;
const querystring = require('querystring');
const ansiStyle = require('./colorStyles');
const jsonSafe = require('./SafeData').jsonSafe;


///*************************************************************
/// helper definitions...
///*************************************************************

var helpers = { $VERSION: fs.statSync(module.parent.filename||'.').mtime.toISOString()};   // export variable

/**
 * @function asBytes converts a standard notation storage size string (i.e. GB, MB, ...) into number of bytes
 * @param {string} b - storage size string
 * @return {number} equivalent number of bytes
 */
helpers.asBytes = (b) => Number(String(b).replace(/([\d.]+)([gmk]?)b?/i, (_m,n,l='')=>{
    let x=l.toLowerCase(); let y=n*(x==l?1000:1024)**(x=='g'?3:x=='m'?2:x=='k'?1:0); return y; }));

/**
 * @function asList coeorses an array or (comma) delimited string into an array
 * @params {string|[]} x - input array or (comma) delimited string
* @params {string} [delim=\/,\\s*\/] - optional delimiter string or regexp, default comma+whitespace regexp
 * @return {[]} - array
 */
helpers.asList = (x,delim=/,\s*/) => x instanceof Array ? x : typeof x==='string' ? x.split(delim) : [];

/**
 * @function asList coeorses an array or (comma) delimited string into a delimited string
 * @params {string|[]} x - input array or (comma) delimited string
 * @params {string} [delim=','] - optional delimiter, default comma
 * @return {string} - comma delimited string
 */
helpers.asStr = (x,delim=',') => x instanceof Array ? x.join(delim) : (x||'');

/**
 * @function asStyle wrapper for ansi style string formating function 
 * @params {array||string} styles - input array or (comma) delimited string of style parameters
 * @params {string} txt - string being formated
 * @return {string} - formated string
 */
helpers.asStyle = (styles,txt) => ansiStyle(helpers.asList(styles),txt);

/**
 * @function asTimeStr converts a time (difference) value in milliseconds into human readable string
 * @param {integer} t - time (difference)
 * @return {number} equivalent time in days, hours, minutes, and seconds
 */
helpers.asTimeStr = t => t>86400000 ? `${Math.floor(t/86400000)} days, ${helpers.asTimeStr(t%86400000)}` : 
                         t>3600000 ? `${Math.floor(t/3600000)} hrs, ${helpers.asTimeStr(t%3600000)}` :
                         t>60000 ? `${Math.floor(t/60000)} mins, ${helpers.asTimeStr(t%60000)}` : `${t/1000} secs`;

/**
 * base64/base64url decoder/encoder functions...
 */
let d64 = (b64) => new Buffer.from(b64,'base64').toString();  // base64 decode to text
let e64 = (t) => new Buffer.from(t).toString('base64');       // text encode to base64
let b64u = (s) => s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); // convert b64 to base64url
let u64b = (s) => (s+'==='.slice(0,(4-s.length%4)%4)).replace(/\-/g, '+').replace(/_/g, '/'); // convert base64url to b64
let j64u = (obj) => b64u(e64(JSON.stringify(obj)));  // JSON to Base64URL
let u64j = (s) => { try { return JSON.parse(d64(u64b(s))) } catch(e) { return {}; } }; // Base64URL to JSON
helpers.base64 = { d64: d64, e64: e64, b64u: b64u, u64b: u64b, j64u: j64u, u64j: u64j };

/**
 * @function distinct filters an array to return only distinct values
 * @params {array} a - input array
 * @return {[]} - array
 */
helpers.distinct = a => a.filter((v,i,a)=>a.indexOf(v)===i);

/**
 * @function hash calculates hash, default sha256 hex format, for input string... 
 * @param {string} msg - message text
 * @param {string} algo - hash algorithm
 * @param {string} enc - hash digest output format
 * @return {string} - message digest
 */
 helpers.hash = (msg,algo='sha256',enc='hex') => crypto.createHash(algo).update(msg).digest(enc);

 /**
 * @function hmac calculates a message authentication hash, sha256, base64 by default
 * @param {string} msg - message text
 * @param {string} key - hash secret
 * @return {string} - message digest
 */
helpers.hmac = (msg,key='',enc='base64',algo='sha256') => crypto.createHmac(algo,key).update(msg).digest(enc);

/**
 * @function serialize removes all circulr references from an object
 * @function circularize restores all circular references of an object; must be linear to start!
 * @param {object} obj - object being modified
 * @return {object} - altered version of obj
 * @example
 *   let circ = {a: 1, b: null}; circ.b = circ;     // circ = <ref *1> { a: 1, b: [Circular *1] }
 *   let clean = serialize(circ);                   // returns {a: 1, b: '<ref *0>'}
 *   let dirty = circularize(clean);                // returns <ref *1> { a: 1, b: [Circular *1] }
 */
let mt = obj => obj instanceof Array ? [] : {};
let scanCircularOrSerialObj = (alt, obj, restore=false, lineage={obj:[],alt:[]}) => {
    if(!obj || typeof obj != "object") return alt;          // only applies to non-null objects
    lineage.obj.push(obj);                                  // add self to list of traveled references
    lineage.alt.push(alt);                                  // add self to list of traveled references
    for (let [key,value] of Object.entries(obj)) {          // loop all children
        if(value && typeof value == "object") {             // child is an object (except null)
            alt[key] = (lineage.obj.includes(value) ?       // circular reference detected!
                `<ref *${lineage.obj.indexOf(value)}>` :    // fix its reference
                scanCircularOrSerialObj(mt(value), value, restore, lineage));   // or recurse each object
        } else {                                            // non-objects
            let idx = typeof value == 'string' && value.match(/<ref \*(\d+)>/); // returns false, null or marker match
            alt[key] = (idx && restore) ? lineage.alt[idx[1]] : value;  // replace with circular reference
        };
    };
    lineage.obj.pop();                                      // cleanup traveled stack for recursive calls
    lineage.alt.pop();                                      // cleanup traveled stack for recursive calls
    return alt;
};
helpers.serialize = obj => scanCircularOrSerialObj(mt(obj),obj);
helpers.circularize = obj => scanCircularOrSerialObj(helpers.jxCopy(obj),obj,true);

// get all methods of an object...
helpers.getAllMethods = chk => { const props = []; let obj = chk;
    do { props.push(...Object.getOwnPropertyNames(obj)); } while (obj = Object.getPrototypeOf(obj)); // folow prototype chain
    return props.sort().filter((p,i,a) =>(p!=a[i+1] && typeof chk[p] === 'function'));  // filter functions
};

/**
 * @function isMod determines if a number is of a given modulo, default 2 (i.e. even-odd function)
 * @param {number} n - number tested
 * @param {number} m - modulo, default 2
 * @return {boolean} - true if n is of the specified modulo
 */
helpers.isMod = (n,m=2) => !(n % m);

/**
 * @function jxCopy deep copy data objects by JSON conversion; no non-JSON or circular references allowed
 * @param {object} obj - object to copy
 * @return {object} - returns an object deep copy 
 */
helpers.jxCopy = obj => { try { return JSON.parse(JSON.stringify(obj)); } catch(e) { console.error(e,obj); return null; } };

/**
 * @function jxTo converts JSON to objects
 * @param {string} json - safe (error-free) string to parse into object
 * @param {{}|[]|null} dflt - default return object
 * @return {*} - returns a string or object
 */
helpers.jxTo = (json,dflt) => { try { return JSON.parse(json); } catch(e) { return dflt } };

/**
 * @function jxFrom generates JSON from objects
 * @param {object} obj - object to convert to JSON
 * @param {boolean} pretty - flag for pretty output, default true
 * @return {string} - returns a JSON string 
 */
helpers.jxFrom = (obj,pretty=true) => JSON.stringify(obj,null,pretty?2:0);

/**
 * @function jxFromCircular generates JSON from CIRCULAR objects, removing circular references
 * @param {object} obj - object to convert to JSON
 * @param {boolean} pretty - flag for pretty output, default true
 * @return {string} - returns a JSON string 
 */
helpers.jxFromCircular = (obj,pretty=true) => JSON.stringify(obj,(()=>{
    const seen = new WeakSet();
    return (k,v)=>(typeof v !=='object' || v===null || v instanceof RegExp) ? v : seen.has(v) ? undefined : (seen.add(v), v);
})(),pretty?2:0);

/**
 * @function jxSafe wrapper for jsonSafe that filters JSON data
 * @param {object} jx - JSON data object to filter
 * @param {boolean} filter - a filter object that parodies the real object delineating filter values
 * @return {object} - returns a filtered object 
 */
helpers.jxSafe = jsonSafe;

/**
 * @function makeArrayOf creates an array of given size and populates with value, where value may be a function
 * @param {number} size - size of output array
 * @param {*} value - value to fill array; may even be a function
 * @return {[]} - Array of specified size and fill
 */ 
 helpers.makeArrayOf = (size,value) => Array(size).fill().map((v,i,a)=>(typeof value=='function') ? value(v,i,a) : value);

 /**
 * @function makeObjectFrom creates an object from an array or arrays, where array[0] defines the keys for ordered values
 * @param {array} a - input array, where array[0] defines the array of keys
 * @return {} - equivalent single object or array of objects
 */ 
helpers.makeObjectFrom = (a) =>{let x=a.slice(1).map(e=>{let o={}; a[0].forEach((k,i)=>o[k]=e[i]); return o;}); 
  return x.length==1 ? x[0] : x; };

/**
 * @function markTime for timing tasks
 * @param {Date} since - beginning time, optional
 * @return {number} - seconds: since==undefined: return start time, or elapsed time from since value 
 */
helpers.markTime = since => since ? (new Date().valueOf()-since)/1000 : new Date().valueOf();

/** 
 * @function pad pads a string, left or right justified to a specified length
 * @param {string|number} str - string or equivalent to be padded
 * @param {number} len - length of output string
 * @param {string} char - character used for padding, default space
 * @param {boolean} left - left justified output flag
 * @return {string} - padded string
 */
helpers.pad = (str,len,ch=' ',left=false) => left ? (Array(len+1).join(ch)+String(str)).slice(-len) :
  (String(str)+Array(len+1).join(ch)).slice(0,len);

/**
 * @function parseURL WHAT WG URL parsing wrapper
 * @param {string} url to parse
 * @param {string} part to return; default a URL object of all parts.
 * @return {any} - parsed URL object
 */
helpers.parseURL = (url) =>{
    let tmp = {};
    try {
        tmp = new URL(url); // absolute URL, returns a class of getters and setters
        tmp = ['href','origin','protocol','username','password','host','hostname','port','pathname','search','searchParams','hash']
            .reduce((t,n)=>{t[n]=tmp[n]; return t},{}); // convert to simple object
        if (tmp.searchParams)
            tmp.query = Array.from(tmp.searchParams.keys()) // aggregates redundant params, i.e. ?ck=1&ck=2 
                .reduce((q,k)=>{let a=tmp.searchParams.getAll(k);q[k]=a.length<2?a[0]:a; return q},{});
    } catch(e) {
        try {
            let [pathname,search] = url.split('?');
            let query = querystring.parse(search); // relative URL
            tmp.mergekeys({pathname,search,query});
        } catch(e) {console.error(e)};
    };
    tmp.port = tmp.port || (tmp.protocol=='https:' ? 443 : (tmp.protocol=='http:' ? 80:'')); // fill in default port
    return tmp;
};

/**
 * @function print returns a simple (non--verbose) serialized variable for logging
 * @param {any} x - serialized variable
 * @param {object} options - options:
 *   quote: quote character to use for strings
 *   keys: quote character to use for object keys; keys with space or underscore automatically quoted
 *   max: max length of return string; truncated with ... to indicate more
 * @return {string} single line serial string
 */
let print = (x,options={}) => {
    const seen = [];
    opts = Object.assign({},typeof options=='object' ? options : {max: options})
    opts.quote = opts.quote || (opts.keys ? opts.keys : "'");
    let qk = (y,z) => z ? `${z}${y}${z}` : y.match(/[ -]/) ? `'${y}'` : `${y}`;
    let q = (y,z) => z ? `${z}${y}${z}` : `'${y}'`;
    let esc = (s,q="'") => s.replaceAll(q,'\\'+q);
    function stringify(x,opts){
        if (x===null || x===undefined || typeof x==='boolean' || typeof x==='number' ) return String(x);
        if (typeof x==='function' || typeof x==='symbol') return q(esc(String(x),'"',),'"');
        if (typeof x==='string') { return q(esc(x,opts.quote),opts.quote); }
        if (x instanceof Date) return q(x.toISOString(),opts.quote);
        if (x instanceof Array) return '['+(x.map(i=>stringify(i,opts))).join(',')+']';
        if (seen.includes(x)) return '"[Circular]"';
        seen.push(x);
        return '{'+
            Object.entries(x).map(e=>[qk(e[0],opts.keys),stringify(e[1],opts)].join(':')).join(',')
            +'}';
    };
    let y = stringify(x,opts);
    return (opts.max>2 && y.length>opts.max) ? y.substring(0,opts.max-3)+'...' : y;
};
helpers.print = print;

/**
 * @function pluralize returns the correct word form for number given
 * @param {integer} num - item count
 * @param {string} singular - singular noun form
 * @param {string} [plural] - optional plural noun form, assumes singular + 's'
 */
helpers.pluralize = (num,singular,plural) => num==1 ? singular : (plural || singular+'s');

/**
 * @function resolveSafePath safely joins path parts (...args) with allowing backtracking past root, i.e. <root>, <../xyz>, ...
 * @param  {...string} args - list of path parts to join
 * @return {string} path - a correctly formatted path, not guarantted to be valid!
 */
helpers.resolveSafePath = (...args) => path.resolve(path.join(args[0],
    ...(args.slice(1).filter(Boolean).map(a=>a.replace(/\.\./g,'')))));
/**
 * @function resolveURL correctly joins a list of path parts (...args) into a valid URL...
 * @param  {...string} args - list of path parts to join
 * @return {string} url - A correctly formatted uniform resource locator
 */
helpers.resolveURL = (...args) => args.join('/').replace(/\/{2,}/g,'/').replace(/:\//,'://');

/**
 * @function sleep async timeout delay
 * @param  {number} ms - milliseconds to wait
 * @example await helpers.sleep(1000);
 */
helpers.sleep =  ms => new Promise(r => setTimeout(r, ms));

/**
 * @function splitAt splits a string or array at an index returning both parts
 * @param  {xs} string or array to split
 * @param  {index} position of split
 * @return array of 2 strings or 2 arrays
 */
helpers.splitAt = (xs,index) => [xs.slice(0,index), xs.slice(index)];
/**
 * @function str2RegExp converts a string (formated as a RegExp) into a RegExp primitive
 * @param {string} str - regular expression string
 * @return {RegExp} - regular expression opbject  
 */ 
 helpers.str2RegExp = _s => {
  let pat = this.indexOf('/')==0 ? this.slice(1,str.lastIndexOf('/')) : str;
  let flags = this.indexOf('/')==0 ? this.slice(str.lastIndexOf('/')+1) : '';
  return new RegExp(pat,flags);
 };
 
/**
 * @function uniqueID generates a unique identifier string of specified length and base
 * @param {number} n - length of output string, default 8
 * @param {number} b - base of output string, default 36
 * @return {string} - unique identifier string
 */
helpers.uniqueID = (n=8,b=36) => {let u=''; while(u.length<n) u+=Math.random().toString(b).substr(2,8); return u.slice(-n); };

/**
 * @function verifyThat deterimes a number of complex variable types
 * @param {*} variable - input variable tested
 * @param {string} isType - choice of type to test; values include: 'isTrueObject', 'isAnyObject', 'isArray','isArrayOfTrueObjects', 
 * 'isArrayOfAnyObjects', 'isArrayOfArrays', 'isEmptyObject', 'isScalar', 'isNotEmpty', 'isDefined' , 'isNotDefined'}
 * @return {boolean} - result of testing variable isType
 */
helpers.verifyThat = (variable,isType) => {
    switch (isType) {
        case 'isTrueObject': return (typeof variable=='object') && (variable!==null)  && !(variable instanceof Array);
        case 'isAnyObject': return (typeof variable=='object');
        case 'isArray': return (variable instanceof Array);
        case 'isArrayOfTrueObjects': return (variable instanceof Array) && helpers.verifyThat(variable[0],'isTrueObject');
        case 'isArrayOfAnyObjects': return (variable instanceof Array) && (typeof variable[0]==='object');
        case 'isArrayOfArrays': return (variable instanceof Array) && (variable[0] instanceof Array);
        case 'isEmpty': return (variable===undefined) || (variable==='') || !helpers.verifyThat(variable,'isNotEmpty');
        case 'isEmptyObject': return !helpers.verifyThat(variable,'isNotEmpty');
        case 'isScalar': return (typeof variable=='string') || (typeof variable=='number');
        case 'isNotEmpty': return (typeof variable=='object') && (variable!==null) && (Object.keys(variable).length>0);
        case 'isDefined' : return (variable!==undefined) && (variable!==null);
        case 'isNotDefined' : return (variable===undefined) || (variable===null);
        default: throw `verifyThat: Unknown type '${isType}' specified`;
    };
};
  

// Export helper functions...
module.exports = helpers;
