/*
  Implements a module for converting JS objects to CSV ...
  (c) 2018 Enchanted Engineering, MIT license

  The csv.js library provides routines for transforming comma separated value
  data to/from JS objects
*/

///************************************************************
///  Dependencies...
///************************************************************
//require("./Extensions2JS"); // dependency on Date stylings


// CSV helper functions
// quote string, if not a number
var csvQuoteIf = x => x===null ? 'null' : x==='' || x===undefined || typeof x==='object' ? '' :
  typeof x==='string' && (x.includes(',') || x.includes('"') || !isNaN(x)) ? '"'+x.replaceAll('"','""')+'"': x;
// quote strings or elements of an array
var csvQuote = v => v instanceof Array ? v.map(x=>csvQuoteIf(x)) : csvQuoteIf(v);
// convert an array of data into a CSV line
var csvLineStringify = (a,eol) => a.length ? eol + csvQuote(a).join(',') : '';
// remove quotes warpping string and unescape ""
let csvUnquote = s => s.startsWith('"')&&s.endsWith('"') ? s.substring(1,s.length-1).replaceAll('""','"') : s;
let csvParseRegex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
let csvLineParse = line =>(line.match(csvParseRegex)||[]).map(m=>m[0]===',' ? m.slice(1) : m)
    .map(x=> x===''||isNaN(x) ? csvUnquote(x) : Number(x));

//  obj2csv function converts an array of JS objects into a csv string.
//  cfg provides conversion configuration info
//    order: an array of label keys that determines the output order,
//      default labels for array of arrays; required for array of objects
//    labels: an array of names for column labels
//      required for array of arrays if useFirstRowAsLabels=false; 
//    useFirstRowAsLabels: boolean to use first row of array or arrays as labels; default true
//    eol: End Of Line sequence; default "\r\n"
function obj2csv(obj,cfg={}) {
    let csv = ''
    cfg.useFirstRowAsLabels = cfg.useFirstRowAsLabels!==false;
    cfg.eol = cfg.eol || "\r\n";
    if (!Array.isArray(obj)) return 'ERROR: requires an array input!'
    if (Array.isArray(obj[0])) {
        cfg.labels = cfg.labels || cfg.useFirstRowAsLabels ? obj[0] : undefined;
        let index = cfg.useFirstRowAsLabels ? 1 : 0;
        if (!cfg.labels) return "ERROR: no labels avaiable!";
        if (cfg.order) {    // first convert to array of objects then use order for output
            let objData = obj.slice(index).map(a=>a.reduce((obj,val,idx)=>{obj[cfg.labels[idx]]=val; return obj},{}));
            return obj2csv(objData,cfg);
        } else {
            csv = csvLineStringify(cfg.order||cfg.labels,'');
            obj.slice(index).map(row=>csv += csvLineStringify(row,cfg.eol));
            return csv;
        }
    } else if (typeof obj[0] == 'object') {
        if (!cfg.order) return "ERROR: Array of objects requires a cfg.order for labels"
        csv = csvLineStringify(cfg.order,'');
        obj.map(row=>csv += csvLineStringify(cfg.order.map(lbl=>row[lbl]),cfg.eol))
        return csv;
    } else {
        return 'ERROR: input must be an array of arrays or objects'
    }
}

// converts a CSV line demitted string or array of lines to JS object
//  cfg provides conversion configuration info
//    labels: an array of names for column labels
//      required if useFirstRowAsLabels=false; 
//    useFirstRowAsLabels: boolean to use first row of array as labels; default true
//    includeLabels: boolean to specify if output should include labels; default true
function csv2obj(csv,cfg={}) {
    let obj = [];
    cfg.useFirstRowAsLabels = cfg.useFirstRowAsLabels!==false;
    cfg.includeLabels = cfg.includeLabels!==false;
    let lines = (typeof csv === 'string') ? csv.split(/\r\n|\r|\n/) : csv;
    cfg.labels = cfg.useFirstRowAsLabels ? csvLineParse(lines[0]) : cfg.labels;
    if (cfg.includeLabels) obj.push(cfg.labels);
    lines.slice(cfg.useFirstRowAsLabels ? 1:0).forEach(line=>line ? obj.push(csvLineParse(line)):undefined)
    return obj;
}

module.exports = {
  csvQuoteIf: csvQuoteIf,
  csvQuote: csvQuote,
  csvLineStringify: csvLineStringify,
  obj2csv: obj2csv,
  csvLineParse: csvLineParse,
  csv2obj: csv2obj
};