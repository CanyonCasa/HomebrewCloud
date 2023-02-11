///*************************************************************
/// Object Extensions...
///*************************************************************
/**
 * @function filterByKey object equivalent of Array.prototype.filter - calls user function with value, key, and source object
 * @memberof Object
 * @param {function} f - function called for each object field
 * @return {{}} - Modified object (does not mutate input unless filterFunc does)
 * @info result will reference source object if value is an object
  */
if (!Object.filterByKey) Object.defineProperty(Object.prototype,'filterByKey', {
    value: 
        function(f) {
            var obj = this; var tmp = {};
            for (var key in obj) if (f(obj[key],key,obj)) tmp[key] = obj[key];
            return tmp;
        },
    enumerable: false
});


const SITE = {
    account: { email: '', fullname: '', member: '', credentials:{password: '', pin: ''}, phone: '', status: '', 
      username: '', other: { location: '',unit: '', account: '', tag: '' } },
    accounts: [ ["Client",'client'], ["Staff",'staff'], ["Admin",'admin'], ["Other",'other'] ],
    locations: [ ['Fox Ridge','FR'], ['Mesa View','MV'] ],
    offices: {
        FR: [ ['Main Office (1028F)','1028F'], ['Old Office (1100A)','1100A'],
            ['Weil Family Center','WFC'], ['Other','other'], ['Not Applicable','NA'] ],
        MV: [ ['Other','other'], ['Not Applicable','NA'] ]
    },
    statuses: [["Pending Activation",'PENDING'], ["Active User",'ACTIVE'], ["Inactive (disabled user)",'INACTIVE']],
    apts: {
        FR: 'ABCDEFHIKLNOQRSTUVWX'.split('').map(u=>[u,u]),
        MV: 'TBD'.split('').map(u=>[u,u])
    }
};


// prep SHOP_DATA...
let inventory = [['Inventory','IV']];
let stock = { IV: [['Main Stock','$1']] };
let sets = SITE.locations.concat(inventory);
console.log('sets:', sets)

let setLabelByTag = sets.reduce((obj,set)=>{obj[set[1]]=set[0]; return obj;},{});
console.log('setLabelByTag',setLabelByTag)

let units = {by:{},keys:{}};
for (let type of ['apts','offices','stock']) {
    let data = SITE[type] || stock;
    for (let set of Object.keys(data)) {
        units.by[set] = units.by[set] || {};
        units.keys[set] = units.keys[set] || [];
        for (let u of data[set]) {
            units.by[set][u[1]] = { unit: { tag: u[1], label: u[0] }, set: { tag: set, label: setLabelByTag[set] }, type: type };
            units.keys[set].push(u[1]);
        };
    };
};
console.log('units:',units)

let u = units.by['MV'];
let active = (t) => u.filterByKey(v=>v.type===t)
console.log('active:',u,active('apts'),u['T'])

let x={}
let y = ['apts','offices','stock'];
//y.forEach(g=>{let gx=SITE[g]||stock;Object.keys(gx).forEach(l=>gx[l].forEach(gx[l[1]]){x[l[1]]=x[l[1]]||{};gx[l[1]].forEach(u=>x[l[1]][u]={unit:{tag:u[1],label:u[0]},location:{tag:l[1],label:l[0]},type:g})}})})
//y.forEach(g=>{console.log(g); /*let gx=SITE[g]||stock;console.log('gx:',gx)*/})
console.log('x:',x)

