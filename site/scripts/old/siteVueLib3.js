// site specific dialogs and customization library for Vue...

import helpers from './ClientLib.js';

const { jsonCopy, newType, scanForMatchTo, verifyThat } = helpers;

// singular location for all shared site data, referenced as this.site...
const SITE_DATA = {
    account: { email: '', fullname: '', member: '', credentials:{password: '', pin: ''}, phone: '', status: '', 
      username: '', other: { location: '',unit: '', account: '', tag: '' } },
    accounts: [ ["Client",'client'], ["Staff",'staff'], ["Admin",'admin'], ["Other",'other'] ],
    grouping: [['All', 'all'],['Units','units'], ['Offices','offices'], ['Inventory','stock']],
    inventory: ['Inventory','IV'],
    locations: [ ['Fox Ridge','FR'], ['Mesa View','MV'] ],
    offices: {
        FR: [ ['Main Office (1028F)','1028F'], ['Old Office (1100A)','1100A'],
            ['Weil Family Center','WFC'], ['Other','other'], ['Not Applicable','NA'] ],
        MV: [ ['Other','other'], ['Not Applicable','NA'] ]
    },
    statuses: [["Pending Activation",'PENDING'], ["Active User",'ACTIVE'], ["Inactive (disabled user)",'INACTIVE']],
    stock: {
        IV: [['Main Stock','$1']]
    },
    units: {
        FR: 'ABCDEFHIKLNOQRSTUVWX'.split('').map(u=>[u,u]),
        MV: 'TBD'.split('').map(u=>[u,u])
    }
};

 const siteLib = {

    config: {
        SITE: SITE_DATA
    },

    components: {

        // account dialog element to encapsulate user account interface...
        'dialog-account': {
            props: ['show','who'],
            data: ()=>({
                // account represents aggregated data sent for /user/change
                account: jsonCopy(SITE_DATA.account),
                activate: { code: '', msg: '' },
                chgdUser: false,
                chgdUsersSet: new Set(),
                credentials: { password: '', pin: '' },
                filter: true,
                group: { name: '', desc: '' },
                groups: [],
                manage: false,
                other: { location: '', unit: '', account: '', tag: '' },
                selectedUser: '',
                status: {error: null, msg: '', exists: false },
                users: [],
                validAccountForm: false,
                validActivateForm: false,
                validUsername: false,
                visible: false
            }),
            computed: {
                admin() { return this.isMember('admin',this.who.member); },
                units() { return this.other.account==='client' ? SITE_DATA.units[this.other.location] : SITE_DATA.offices[this.other.location] },
                manager() { return this.isMember('admin,manager',this.who.member); },
                mode() { return this.manage ? 'Manage' : this.who.valid ? 'Edit' : 'Create'; },
                usersList() { return this.users.map(u=>({value:u.username, label:u.fullname+' ('+u.username+')'})); },
                valid() { return this.who && this.who.valid; },
                visIcon() { return this.visible ? 'visibility_off' : 'visibility'; }
            },
            methods: {
                accountDo() {
                    if (!(this.who || this.who.token)) return;
                    if (this.chgdUser) this.userMerge();
                    if (this.chgdUsersSet.size==0) return;
                    var body = this.manage ? this.users.filter(u=>this.chgdUsersSet.has(u.username)).map(ux=>({ref: ux.username, record: ux})) : 
                        [{ ref: this.account.username, record: this.account }];
                    let hdrs = this.who.token ? {authorization: `Bearer ${this.who.token}`} : {};
                    this.fetchJSON('POST','/user/change',{ headers: hdrs, body: body } )
                        .then(res=>{ 
                            if (res.error || res.jxError) {
                                this.report(res.error || res.jxError, 'Account operation failed; username may exist; First login to change existing user.')
                                return
                            };
                            let queue = [];
                            let anyErr = false;
                            res.jx.forEach(u=>{
                                let uerr = u[0]=='error';
                                let usr = u[1] || this.account.username;
                                let msg =  uerr ? `Account operation failed for user ${usr} (${u[2].code}:${u[2].msg})` : 
                                    `Account operation successful for user ${usr}`;
                                anyErr ||= uerr;
                                queue.push(msg);
                            });
                            this.report(anyErr, queue.join('<br>'));
                            this.chgdUsersSet.clear(); })
                        .catch(e=>{ this.report(e, e.toString()); });
                },
                chg(e) {
                    this.chgdUser = true;
                    this.chgdUsersSet.add(this.selectedUser);
                    this.validateForms();
                },
                chgGroup(action) {
                    if (!this.who || !this.who.token) return;
                    let tmp = [{ref: this.group.name, record: this.group}];
                    switch (action) {
                        case 'name': 
                            this.group.desc = (this.groups[this.group.name]||{}).desc || ''; 
                            return;
                        case 'edit':
                            if (!scanForMatchTo(this.groups,{name: this.group.name},null)) return;  // do not edit non-existing group
                            this.groups.map((g,i)=>this.groups[i].desc = g.name==this.group.name ? this.group.desc : g.desc);
                            break;
                        case 'add': 
                            if (scanForMatchTo(this.groups,{name: this.group.name},null)) return;  // do not add existing group
                            this.groups.push({name: this.group.name, desc: this.group.desc}); 
                            break;
                        case 'del': 
                            this.groups = this.groups.filter(g=>g.name!=this.group.name);
                            tmp.record = null;
                            break;
                    };
                    this.fetchJSON('POST', '/user/groups/',
                      { headers: {authorization: `Bearer ${this.who.token}`}, body: tmp} )
                        .then(res=>{ 
                            if (res.error||res.jxError) throw 'Failed to update groups...';
                            this.report(null,'Groups updated successfully'); 
                            return;
                        })
                        .catch(e=>{ this.report(e,"Groups post failed: "+e.toString());});
                },
                chgMember(group,chkd) { this.chgMembers(group,chkd,this.account.username); this.chg(); },
                chgMembers(group,chkd,user) {
                    let usr = scanForMatchTo(this.users,{username:user},{});
                    let ms = usr.member ? new Set(usr.member.split(',')) : [];
                    chkd ? ms.add(group) : ms.delete(group);
                    usr.member = [...ms].join(',');
                    this.chgdUsersSet.add(user);
                    if (this.account.username==user) this.account.member = usr.member; 
                    this.validateForms();
                },
                chgCreds() { this.account.credentials = this.credentials; this.validateForms(); },
                chgOther() { this.account.other = this.other; this.validateForms(); },
                chgUser(user) {
                    if (this.selectedUser!=user) this.selectedUser = user;
                    this.userMerge();
                    let clr = obj =>{ let n=newType(obj); for (let [k,v] of Object.entries(obj)) n[k]=typeof v=='object'?clr(v):''; return n; };
                    let ux = scanForMatchTo(this.users,{username:user},clr(this.account));
                    let setAccount = (a,u)=> a.mapByKey((v,k)=>typeof v=='object' ? setAccount(v,u[k]||{}) : u[k]||'');
                    this.account = setAccount(this.account,ux);
                    this.other = setAccount(this.account.other,ux.other);
                    this.credentials = setAccount(this.account.credentials,{});
                    this.$nextTick(()=>{this.$refs['account-username'].focus()});
                },
                codeCheck() { 
                    this.fetchJSON('POST','/user/code/'+this.account.username+'/'+this.activate.code)
                        .then(res=>{ this.report(res.jx.error,res.jx.msg); this.activate.msg = res.jx.msg; })
                        .catch(e=>{ this.report(e, e.toString()); });
                },
                codeRequest() {
                    this.fetchJSON('GET','/user/code/'+this.account.username)
                        .then(res=>{ this.report(res.jx.error,res.jx.msg); this.activate.msg = res.jx.msg; })
                        .catch(e=>{ this.report(e, e.toString()); });
                },
                groupNotAdmin(name) { return (name=='admin'||name=='manager')&&!this.admin; },
                groupByName(name) { return scanForMatchTo(this.groups,{name:name},null); },
                groupMembers(name) { return this.users.map(u=>({un:u.username,ckd:this.isMember(name,u.member)})); },
                isMember(ax='',mx='') { return (typeof ax=='string' ? ax.split(',') : ax).some(a=>mx.split(',').includes(a)) },
                listGroupsAndUsers() {
                    if (!this.manager || !this.who || !this.who.token) return;
                    this.fetchJSON('GET','/user/groups',{headers:{authorization: `Bearer ${this.who.token}`}})
                        .then(res=>{ this.groups = res.jxOK&&!res.jx.error ? res.jx : []; })
                        .catch(e=>console.error("listGroupsAndUsers[groups]:",e));
                    this.fetchJSON('GET','/user/users',{headers:{authorization: `Bearer ${this.who.token}`}})
                        .then(res=>{ this.users = res.jxOK&&!res.jx.error ? res.jx : []; })
                        .catch(e=>console.error("listGroupsAndUsers[users]:",e));
                },
                resetPW() { this.account.password = this.account.password ? '' : '#Temp1234'; this.visible=true; this.chg(); },
                report(err,msg) { this.status = {error: err, msg: msg}; },
                see() { this.visible = !this.visible; },
                userMerge() { // merge changes to user if changed
                    if (!this.chgdUser) return;
                    let existingUser = scanForMatchTo(this.users,{username:this.account.username},null);
                    if (existingUser) { existingUser.mergekeys(this.account); } else { this.users.push(jsonCopy(this.account)); };
                    this.chgdUser = false;
                },
                validateForms() {
                    let check = f => !!(f && f.checkValidity && f.checkValidity());
                    this.validAccountForm = this.manage || check(this.$refs['account-form']); // whole account form button enable
                    this.validActivateForm = check(this.$refs['account-activate-form']);
                    this.validUsername = check(this.$refs['activate-username']);
                },
                wndwClose() { this.$emit('close', 'account'); }
            },
            watch: {
                manager() { this.listGroupsAndUsers(); },
                show() {
                    if (!this.show || !this.valid) return;
                    if (this.users.length==0) this.users = [jsonCopy(this.who)];
                    if (this.account.username=='') this.chgUser(this.who.username);
                }
            },
            template: `
                <div class="account-dialog" v-show="show">
                  <h3>Account...<i class="wndw-icon" v-icon:close @click="wndwClose" ></i>
                    <i class="wndw-icon" v-if-class:none="!manager" v-icon:people title="Manage Users" @click="manage=!manage"></i></h3>
                  <span v-show="!manage" class="account-text text-indent">
                    <p class="text-alert">Privacy Notice: Information used only for account management and not shared with third parties.</p>
                    <p>To change existing account information, please login first...</p>
                  </span>
                  <h4>{{ !valid ? 'Step 1: Create Account...' : mode+' Account...' }}</h4>

                  <!-- Users list for when managing any user... -->
                  <div class="account-grid" v-show="manage">
                    <label class="account-label">User:</label>
                    <span class="account-input">
                      <select v-model="selectedUser" @change="chgUser(selectedUser)">
                        <option v-for="u of usersList" :value="u.value">{{u.label}}</option>
                      </select>
                      <i class="account-icon text-icon" v-icon:ico-filter @click.prevent="filter=!filter"></i>
                    </span>
                    <label v-show="filter" class="account-label">Filter:</label>
                    <label v-show="filter" class="account-desc">TBD</label>
                  </div>

                  <form class="account-form" ref="account-form" @keyup="chg">
                    <!-- Credentials... -->
                    <blk-x hdr="Credentials..." inhibit="true" init="true">
                      <label class="account-label">Username:</label>
                        <label v-show="valid" class="account-input text-bold">{{account.username}}</label>
                        <input v-show="!valid" class="account-input validated" ref="account-username" type="text" 
                          placeholder="username" v-model="account.username" v-pattern:username required autocomplete @input="chg">
                        <span class="account-desc" v-pattern:username.desc></span>
                      <label class="account-label">Password:</label>
                      <span>
                        <input class="account-input account-pw validated" autocomplete="off" ref="account-password" placeholder="password/code" 
                          :type="visible?'text':'password'" v-model="credentials.password" v-pattern:password :required="!manage" @input="chgCreds">
                        <i class="account-eye" v-icon:[visIcon] @click.prevent="see"></i>
                        <i class="account-reset" v-if-class:none="!manage" v-icon:cached title="Reset password" @click.stop="resetPW"></i>
                      </span>
                      <span class="account-desc" v-pattern:password.desc></span>
                      <span class="account-desc" v-if=manage>Leave blank to remain unchanged.</span>
                      <label class="account-label">Pin:</label>
                      <span>
                        <input class="account-input account-pw validated" autocomplete="off" ref="account-pin" placeholder="optional pin" 
                          :type="visible?'text':'password'" v-model="credentials.pin" v-pattern:tag @input="chgCreds">
                        <i class="account-eye" v-icon:[visIcon] @click.prevent="see"></i>
                      </span>
                      <span class="account-desc" v-pattern:tag.desc></span>
                      <span class="account-desc">Leave blank to remain unchanged.</span>
                    </blk-x>

                    <!-- Personal identification info... -->
                    <blk-x hdr="Identity..." init="true">
                      <label class="account-label">Fullname:</label>
                      <input class="account-input validated" type="text" placeholder="fullname" v-model="account.fullname" 
                        v-pattern:fullname required autocomplete @input="chg">
                      <span class="account-desc" v-pattern:fullname.desc></span>
                      <label class="account-label">Email:</label>
                      <input class="account-input validated" type="text" placeholder="email" v-model="account.email" 
                        v-pattern:email required autocomplete @input="chg">
                      <span class="account-desc" v-pattern:email.desc></span>
                      <label class="account-label">Phone:</label>
                      <input class="account-input" v-if-class:validated="!!account.phone" type="text" placeholder="phone" 
                        v-model="account.phone" v-pattern:phone :required="!!account.phone" autocomplete @input="chg">
                      <span class="account-desc" v-pattern:phone.desc></span>
                      <span class="account-desc text-alert">Must be capble of receiving texts!</span>

                      <!-- Site specific info... -->
                      <span class="account-msg">Other...</span>

                      <label class="account-label">Account:</label>
                      <select class="account-input validated" v-model="other.account" required @change="chgOther">
                        <option disabled :selected="other.account==''" value='none'>Please select one ...</option>
                        <option v-for="c of SITE.accounts" :selected="other.account==c[1]" :value="c[1]">{{c[0]}}</option>
                      </select>
                      <span class="account-desc">Please select the appropriate account.</span>

                      <label class="account-label">Location:</label>
                      <select class="account-input validated" v-model="other.location" required @change="chgOther">
                        <option disabled :selected="other.location==''" value=''>Please select one ...</option>
                        <option v-for="c of SITE.locations" :selected="other.location==c[1]" :value="c[1]">{{c[0]}}</option>
                      </select>
                      <span class="account-desc">Please select the appropriate location.</span>

                      <label class="account-label">Unit:</label>
                      <select class="account-input validated" v-model="other.unit" required @change="chgOther">
                        <option disabled :selected="other.unit==''" value=''>Please select one ...</option>
                        <option v-for="c of units" :selected="other.unit==c[1]||c[0]" :value="c[1]||c[0]">{{c[0]}}</option>
                      </select>
                      <span class="account-desc">Please select the appropriate unit.</span>

                      <label class="account-label">Security Tag:</label>
                      <input class="account-input validated" type="text" placeholder="tag" v-model="other.tag" 
                        v-pattern:tag @input="chg">
                      <span class="account-desc" v-pattern:tag.desc></span>
                      <span class="account-desc">Must match the tag of others sharing the same cart, for example a spouse.</span>
                    </blk-x>

                    <!-- Administrative info for managers only... -->
                    <blk-x v-if="manage" hdr="Administrative...">
                      <label class="account-label">Status:</label>
                      <select class="account-input validated" v-model="account.status" @change="chg">
                        <option v-for="c of SITE.statuses" :value="c[1]">{{c[0]}}</option>
                      </select>
                      <span class="account-msg">Group Membership (Permissions)...</span>
                      <template v-for="g in groups">
                        <span class="account-label">          
                        <label class="account-group text-small" v-if-class:text-alert="g.name==group.name" 
                          @click.stop="group.mergekeys(g)">{{g.name}}</label>
                        <input type="checkbox" name="member" :checked="isMember(g.name,account.member)" :disabled="groupNotAdmin(g.name)" 
                          @change="chgMember(g.name,$event.target.checked)">
                        </span>
                        <span class="account-desc" v-if-class:text-alert="g.name==group.name">{{g.desc}}</span>
                      </template>
                      <template v-if="admin">
                        <span class="account-msg">Edit Group...</span>
                        <label class="account-label">Name:</label>
                        <input class="account-input validated" type="text" placeholder="Group" v-model="group.name" v-pattern="/[a-z]+/"
                          @click.stop @keyup.stop v-debounce.input="()=>chgGroup('name')">
                        <label class="account-label">Desc:</label>
                        <input class="account-input stretch validated" type="text" placeholder="Description" v-model="group.desc" 
                          v-pattern:text @click.stop @keyup.stop>
                        <label class="account-label">Members:</label>
                        <span class="account-desc" v-show="group.name">
                          <label class="text-no-wrap" v-for="m in groupMembers(group.name)">
                          <input type="checkbox" name="gm" :checked="m.ckd" :disabled="groupNotAdmin(group.name)" 
                            @change="chgMembers(group.name,$event.target.checked,m.un)">:
                          <span v-if-class:text-bold="m.ckd">{{m.un}}</span></label>
                        </span>
                        <span class="account-input">
                          <i v-icon:add_box title="Add new group" @click="chgGroup('add')"></i>
                          <i v-icon:edit title="Edit named group" @click="chgGroup('edit')"></i>
                          <i v-icon:delete v-if-class:none="!groupByName(group.name)" title="Delete named group" @click="chgGroup('del')"></i>
                        </span>        
                        <span class="account-msg">Changed...</span>        
                        <label class="account-input text-bold">{{Array.from(chgdUsersSet).join(',')}}</label>
                      </template>
                    </blk-x>
                    <!-- form submission... -->
                    <input type="button" class="account-button" :disabled="!validAccountForm" @click.stop="accountDo" 
                      :value="valid?'EDIT ACCOUNT'+((chgdUsersSet.size==1)?'':'S'):'SIGN UP'">
                    <div class="text-small"  v-if-class:text-error="status.error">{{ status.msg }}</div>
                  </form>
                  <div  v-if="!valid">
                  <h3>Step 2: Activate Account...</h3>
                  <form ref="account-activate-form" class="account-grid" @keyup="chg">
                    <label class="account-label">Username:</label>
                    <input class="account-input validated" type="text" placeholder="username" v-pattern:username required 
                      ref="activate-username" v-model="account.username">
                    <span class="account-desc text-small" v-pattern:username.desc></span>
                    <label class="account-label">Code:</label>
                    <input class="account-input validated" type="text" placeholder="challenge code" ref="account-code" v-model="activate.code"
                      v-pattern:code required @keyup.enter="codeCheck">
                    <span class="account-desc text-small" v-pattern:code.desc></span>
                    <span class="account-desc text-small">
                    <button class="account-button" type="button" :disabled="!validUsername" @click="codeRequest">Get Code</button>
                    <button class="account-button" type="button" :disabled="!validActivateForm" @click="codeCheck">Activate</button>
                    </span>
                    <span class="account-desc text-alert text-small" v-if-class:error="status.error">{{ activate.msg }}</span>
                  </form>
                  </div> 
                </div>`
        },
        
        // login dialog element to encapsulate user login interface...
        'dialog-login': {
            props: ['show', 'who'],
            data: ()=>({
                error: false,
                formValid: false,
                msg: '',
                password: '',
                token: '',
                username: '',
                usernameValid: false,
                visible: false
            }),
            mounted() { this.restoreCreds(); }, 
            computed: {
                eyeIcon() { return this.visible ? 'visibility_off' : 'visibility' }
            },
            methods: {
                chg(dx) {
                    this.usernameValid=this.$refs["login-username"].checkValidity();
                    this.formValid=this.$refs["login-dialog"].checkValidity();
                },
                getCode() {
                    this.fetchJSON('GET','/user/code/'+this.username)
                        .then(res=>{ this.error = !!res.jx.error; this.msg = res.jx.msg; })
                        .catch(e=>{ console.error(e); this.error = true; this.msg = e.toString(); });
                },
                login(token) {
                    // build authorization header
                    var auth = token ? `Bearer ${token}` : `Basic ${btoa(this.username+":"+this.password)}`;
                    var creds = { payload: {}, token: '', error: true, msg: '', valid: false }; // default failure
                    this.fetchJSON('GET','/login',{headers: {authorization: auth}})
                        .then(res=>{
                            creds.mergekeys(res.jx).mergekeys({ error: !!res.jx.error, msg: res.jx.msg||'' }); 
                            creds.valid = verifyThat(creds.payload,'isNotEmpty');
                            this.notify(creds);
                            if (creds.valid && this.show) this.wndwClose(); })
                        .catch(e=>{
                            creds.msg = e.toString();
                            this.notify(creds);
                        });
                },
               notify(creds={},restored=false) {
                    this.error = creds.error || false;    // set local variables and store payload and token - valid or not
                    this.msg = creds.msg || '';
                    this.token = creds.token || '';
                    this.storage.local =  { jwt: creds.valid ? { token: creds.token, payload: creds.payload } : undefined };
                    let user = { member: '', token: this.token, valid: !!creds.valid }.mergekeys(creds.payload);   // define user
                    this.username = user.username || '';  // update username field
                    this.$emit('user',user,restored);     // pass user credentials to parent level
                },
                restoreCreds() {
                    if (!this.storage.jwt) return;
                    let { payload, token } = this.storage.jwt;
                    let valid = payload && 1000*(payload.iat+payload.exp) > new Date().valueOf();
                    let creds = valid ? { valid: true, token: token, payload: payload, error: false, msg: '' } :
                        { valid: false, error: true, msg: 'Invalid or Expired login token' };
                    this.notify(creds,valid);
                    if (valid && payload.ext) this.login(token);    // login extendable?, do so in background
                },
                see() { this.visible = !this.visible; this.$refs['lgnPW'].type = this.visible ? 'text' : 'password'; },
                wndwClose() { this.$emit('close', 'login'); }
                },
            watch: {
                show() { if (this.show) this.$nextTick(function() {this.$refs['login-username'].focus()}); }
            },
            template: `
                <form class="login-dialog" ref="login-dialog" v-show="show">
                  <span class="login-text text-large">Sign in...<i class="wndw-icon" v-icon:close @click="wndwClose" ></i></span>
                  <span class="login-text text-small text-italic">Enter your credentials...</span>
                  <input class="login-input validated" ref="login-username" type="text" placeholder="username" v-model="username" 
                    v-pattern:username required autocomplete="username" @input="chg">
                  <input ref="lgnPW" class="login-input login-pw validated" type="password" placeholder="password/code" v-model="password" 
                    v-pattern:password required autocomplete="current-password" @input="chg" @keyup.enter="login()">
                  <i class="login-eye" v-icon:[eyeIcon] @click.prevent="see"></i>
                  <input type="button" class="login-button" :disabled="!usernameValid" @click.stop="getCode" value="GET CODE">
                  <input type="button" class="login-button" :disabled="!formValid" @click.stop="login()" value="SIGN IN">
                  <span class="login-link text-italic" @click="$emit('new')">Create Account</span>
                  <span class="login-msg text-small"  v-if-class:text-error="error">{{ msg }}</span>
                </form>`
        },
        
        // louout dialog element to encapsulate user logout interface...
        'dialog-logout': {
            props: ['show', 'who'],
            data: ()=>({}),
            methods: {
                logout() {
                    if (!this.who.token) return;  // only logout if user is logged in
                    this.fetchJSON('GET','/logout',{headers: {authorization: `Bearer ${this.who.token}`}})
                        .then(res=>{ 
                            if (res.error||res.jxError) throw 'logout failed...';
                            console.error('LOGOUT')
                            if (this.storage.jwt) { this.storage.jwt = undefined; };
                            this.$emit('logout',res.jx);
                            })
                        .catch(e=>{ console.error(e); this.$emit('error',e); });
                }        
            },
            template: `
                <span class="identity" v-tip="'logout'" v-show="show" @click="logout">
                    {{ who.fullname }}<br />as {{ who.username }}<i class="id-icon" v-icon:cancel></i>
                </span>`
        },

    },

}

export default siteLib;
