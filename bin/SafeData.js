/*
  Implements a module for Safe JSON data filtering ...
  (c) 2019 Enchanted Engineering, MIT license

  The SafeData.js library provides a reusable utility set of routines for 
  filtering user input data provided as JSON objects. It includes easily 
  customized pre-defined filter patterns.

  Exports include...
    rexSafe:        Basic regular expression filtering method
    scalarSafe:     Basic scalar data filtering method, including HTML
    jsonSafe:       Recursive JSON filtering method, including HTML fields
*/

///************************************************************
///  Dependencies...
///************************************************************
require("./Extensions2JS"); // dependency on Date stylings

const patterns = {
  id: /^[$a-z0-9_-]+/i,
  text: /^[^\/<>]+/,
  http: /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
  base64: /[A-Za-z0-9+\/_\-:=]+/  // allows colon joined base64/base64url strings
}

// simple regular expression pattern test ...
function rexSafe(data,pattern,dflt) {
  var m=String(data).match(pattern);
  return (m) ? data.constructor(m[0]) : dflt!==undefined ? dflt : undefined;  // returns same type of data! (i.e. numbers or strings)
};

// scalarSafe scrubs scalar data using specified filter defined as pattern (string or RegExp) or [pattern,default], 
//   where pattern defines the regular expression or keyword match pattern, including...
//     undefined, null, '', '*', boolean, numeric, integer, date, or RegExp
//   dflt represents default value when no data is present or date modifier (i.e. date style format)    
//   Note: regex backslashes must be escaped!!!, e.g. \\t for tab
function scalarSafe(data,filter,verbose){
  var [pat,dflt] = filter instanceof Array ? filter : [filter];
  if (verbose) console.log(`scalarSafe: filter '`,data,`' with pattern: '${pat}' and default: '${dflt}'`);
  if (pat==='*') return data; // bypass, no filtering
  // if no data, except for patterns, return default
  if ((data===undefined || data===null || data==='') && !['boolean','date','choice'].includes(pat)) { return dflt!==undefined ? dflt : data; };
  // begin checking data...
  // explicitly test pattern and data... 
  switch (pat) {
    case 'undefined': return undefined; break;  // only returns undefined 
    case 'null': return null; break;            // only returns null
    case '': return dflt||''; break;            // returns '' or a forced value from default
    case 'boolean':                             // returns only true or false
      return (data===true||data===false) ? data : (dflt==true); break;
    case 'integer':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseInt(dflt||0) : parseInt(data); break; // "exceptions" to isNaN previously screened
    case 'numeric':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseFloat(dflt||0) : parseFloat(data); break; // "exceptions" to isNaN previously screened
    case 'date':                                // returns a valid date, per 'dflt' format or iso
      return (isNaN(Date.parse(data)) ? new Date() : new Date(data)).style(dflt||'iso'); break;
    case 'choice':                              // value must be one of a list (dflt), default to first item
      if (typeof dflt == 'string') dflt = dflt.split(',');  // dflt may be comma delimited string or array
      return dflt.indexOf(data)==-1 ? dflt[0] : data;
    default:
      let rex = (x) => new RegExp(x.slice(1,x.lastIndexOf('/')),x.slice(x.lastIndexOf('/')+1));
      let re = patterns[pat] ? patterns[pat] : 
            ((typeof pat=='string') && pat.startsWith('/')) ? rex(pat) : undefined;
      if (!(re instanceof RegExp)) return dflt||''; // only data and regex pattern should remain...
      let rx = rexSafe(data,re,dflt);
      if (verbose) console.log(`rexSafe[${filter}]: '${data}' with pattern: '${re}' and default: '${dflt}' => ${rx}`);
      return rx;
  };
};

// recursive JSON filter. Expects a filter with structure matching JSON data, jx
function jsonSafe(jx,filter,verbose) {
  if (verbose) console.log('jsonSafe: filter ',jx, ' with ', filter);
  if (filter==='*') return jx;
  if (typeof jx!='object') {
    // scalar input...
    return scalarSafe(jx,filter,verbose);
  } else if (Array.isArray(jx)) {
    // array input... note filter should be an array of [pattern,dflt] arrays
    var jxa = [];
    if (filter.length==1) {
      // shortcut filter definition supported for arrays; if only 1 element, use same filter[0] for all jx checks
      for (var i=0;i<jx.length;i++) jxa.push(jsonSafe(jx[i],filter[0],verbose));
    } else {
      // longhand - only filter elements defined in filter
      for (var i=0;i<filter.length;i++) jxa.push(jsonSafe(jx[i],filter[i],verbose));
    };
    return jxa;
  } else {
    if (jx==null) return jx;  // null never filtered
    // assume object input...
    var jxo = {};
    if (typeof(filter)==='string' && filter.includes(":")) {  // assume simple key value checks for each input field
      var fltrs = filter.split(":");
      for (var k in jx) {
        var fk = scalarSafe(k,fltrs[0],verbose);
        if (fk && jx[fk] && typeof(jx[fk]!=='object')) {
          var fv = scalarSafe(jx[fk],fltrs[1],verbose);
          if (fv) jxo[fk] = fv;
        }
      }
    } else { // use keys of respective filter item for checks, extra jx keys not in filter are removed!
      for (var k in filter) jxo[k] = jsonSafe(jx[k],filter[k],verbose); 
    }
    return jxo; 
  };
};

module.exports = {
  rexSafe: rexSafe,
  scalarSafe: scalarSafe,
  jsonSafe: jsonSafe
  };
