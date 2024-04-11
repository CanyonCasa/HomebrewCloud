/*
  Module to consolidate authentication routines for reuse...
*/
const { asList, base64, hash, print, verifyThat } = require('./helpers');
const { auth, jwt, logins } = require('./workers');

/**
 * @function addUserCandy extends the user database with convenience functions
 * @param {object} db - the user database 
 * @return {object} db - the databse for chaining
 */
let addUserCandy = (db) => {
    let proto = Object.getPrototypeOf(db);
    proto.getUser = function getUser(usr) { return this.query('userByUsername',{username:usr.toLowerCase()}) };
    proto.chgUser = function chgUser(usr,data) { return this.modify('users',[{ref: usr.toLowerCase(), record: data}]) };
    return db;
};

/**
 * @function authorize validates an authenticated user's access to a particular resource based on group memebership
 * @param {string|array} allowed - list of groups allowed permission to the resource
 * @param {string|array} memberOf - list of groups of which user is a member
 * @return {boolean} indicates user's permission 
 */
let authorize = (allowed,memberOf) => { // user authenticated if this gets called; otherwise default "(a)=>a||false" gets called!
    if (['',null,undefined,'users'].includes(allowed)) return true;
    let granted = asList(allowed);
    let membership = asList(memberOf);
    return membership.some(m=>granted.includes(m)) || membership.includes('admin');
};


/**
* @function auth performs user authentication based on the authorization header
* @param {object} [options]
* @return {object} middleware
*/
async function authenticate(ctx) {
    let self = this;
    let usersDB = self.db.users;
    let scribble = self.scribe || self.scribble;
    let failed = (usr, tag, err) => {
        if (usr) logins.log(usr, tag, err);
        ctx.authenticated = false;
        ctx.authorize = (a)=>['',null,undefined].includes(a);
        ctx.user = {member:'', username:''}
        ctx.error = err;
    };
    let aheader = (ctx.request?.HEADERS || ctx.headers)?.authorization;
    if (!aheader) return failed();
    scribble.trace(`authenticate: ${print(aheader,100)}`);
    let header = parseAuthHeader(aheader);  // always needed for authentication
    if (header.error) return failed('-','header error',header.error);
    if (header.method==='bearer') { // JWT authentication requested
        if (!jwt.verify(header.token)) return failed(header.username,'failed JWT', { code: 401, msg: 'Expired or Invalid JWT credentials' });
        ctx.user = header.fields.payload;  // valid JWT so authentication valid
        logins.log(ctx.user.username,'validated bearer login');
    } else if (header.method==='basic') { // Basic authentication requested (i.e. login)
        if (!header.username && !header.password) return failed(header.username,'failed invalid', { code: 401, msg: 'Invalid authentication credentials' });
        let user = usersDB.getUser(header.username);
        if (verifyThat(user,'isEmpty')) return failed(header.username,'failed user', { code: 401, msg: 'Invalid user credentials' });
        if (user.status!=='ACTIVE') return failed (user.username,'failed inactive', { code: 401, msg: 'Inactive user' });
        let valid = await validate(header,user);
        ////////////////////////////////////////////////////////////////
        // TEMPORARY PATCH FOR BACK COMPATIBILITY WITH PRIOR HOMEBREW CODE
        if (!valid) {   // may be old format of pre-hashed password...
            let oldChallenge = hash(header.username+header.password);
            valid = await auth.checkPW(oldChallenge,user.credentials.hash);
            if (valid) {    // update credentials
                user.credentials.oldHash = user.credentials.hash;
                user.credentials.hash = await auth.genHashPW(header.password);
                scribble.trace(`authenticate: updating ${user.username} credentials `);
                usersDB.chgUser(user.username,{credentials: user.credentials});
            } else {
                return failed(user.username,'failed login', { code: 401, msg: 'Authentication failed!' });
            };
        ////////////////////////////////////////////////////////////////
        };
        delete user.credentials;
        ctx.user = user;
        logins.log(user.username,'validated basic login');
    } else {
        return failed('???','unknown/unsupported auth method', { code: 401, msg: 'Authentication failed!' });
    };
    // only get here if user has been authenticated
    ctx.authenticated = header.method;
    ctx.authorize = (allowed,membership=ctx.user.member) => authorize(allowed,membership);
    scribble.trace(`authenticate: ${ctx.user.username} => ${ctx.user.member}`);
};

/**
* @function parseAuthHeader parses the Authorization header into parts used downstream
* @param {string} header - the Authorization header
* @reutrn {object} header object on success or {} on failure
*/
let parseAuthHeader = (header) => {
    if (!header) return  null;
    let hdr = { header: header, tokens: (header+" ").split(/\s+/,2) };
    [hdr.method, hdr.token] = [hdr.tokens[0].toLowerCase(), hdr.tokens[1]];
    if (!hdr.method || !hdr.token) return  {error: { code: 401, msg: `Malformed Authorization header: ${header}` }};
    if (hdr.method=='basic') {
        hdr.text = base64.d64(hdr.token);
        [hdr.username, hdr.password] = (hdr.text+':').split(':',2);
    } else if (hdr.method=='bearer') {
        hdr.fields = jwt.extract(hdr.token);    // just parse header!
        hdr.username = (hdr.fields.payload||{}).username||'';
    } else {
        return {error: { code: 401, msg: `Authentication Method Not Supported!: ${header}` }};
    };
    return hdr;
};

let validate = async (login={}, user={credentials:{}}) => {
    if (!login.username || (login.username!==user.username)) return false;   // not the correct account
    if (await auth.checkPW(login.password,user.credentials.hash)) return true;           // valid password
    if (auth.checkCode(login.password,user.credentials.passcode)) return true;           // or a passcode login
    return false;
};

module.exports = {
    addUserCandy: addUserCandy,
    authenticate: authenticate,
    authorize: authorize,
    parseAuthHeader: parseAuthHeader,
    validate: validate
}