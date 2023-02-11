// site specific dialogs and customization library for Vue...

import helpers from './ClientLib.js';

const { distinct, jsonCopy, verifyThat } = helpers;

const SITE = {
    account: { email: '', fullname: '', member: '', credentials:{password: '', pin: ''}, phone: '', status: '', 
        username: '', other: { location: '',unit: '', account: '' } },
    accounts: [ ["Client",'client'], ["Staff",'staff'], ["Admin",'admin'], ["Other",'other'] ],
    defaultPassword: '#Temp1234', 
    locations: [ ['Fox Ridge','FR'], ['Mesa View','MV'] ],
    offices: {
        FR: [ ['Main Office (1028F)','1028F'], ['Old Office (1100A)','1100A'],
            ['Weil Family Center','WFC'], ['Other','OTHER'], ['Not Applicable','NA'] ],
        MV: [ ['Other','OTHER'], ['Not Applicable','NA'] ]
    },
    statuses: [["Pending Activation",'PENDING'], ["Active User",'ACTIVE'], ["Inactive (disabled user)",'INACTIVE']],
    apts: {
        FR: 'ABCDEFHIKLNOQRSTUVWX'.split('').map(u=>['Apt '+u,u]),
        MV: 'TBD'.split('').map(u=>['Apt '+u,u])
    }
};

const siteLib = {

    config: {
        // singular location for all shared site data, referenced as this.SITE...
        SITE: SITE
    },

    components: {

        // account dialog building blocks...
        // implements the account activate form
        'accnt-activate': {
            props: ['username'],
            data: function () { return {
                activate: { error: false, msg: '' },
                code: null,
                name: this.username,
                validActivateForm: false,
                validUsername: false
            }},
            mounted() { this.validate(); },
            methods: {
                codeCheck() { 
                    if (!this.validActivateForm) return;
                    this.fetchJSON('POST','/user/code/'+this.name+'/'+this.code)
                        .then(res=>res.jxOK&&!res.jx.error ? res.jx : [])
                        .then(res=>{ this.activate = { error: false, msg: res.msg } })
                        .catch(e=>{ console.error('post code:',e); this.activate = { error: e, msg: e.toString() } })
                },
                codeRequest(by) {
                    this.fetchJSON('GET','/user/code/'+this.name+(by?'/'+by:''))
                        .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                        .then(res=>{ this.activate = { error: false, msg: res.msg } })
                        .catch(e=>{ console.error('get code:',e); this.activate = { error: e, msg: e.toString() } })
                },
                validate() {
                    let check = f => !!(f && f.checkValidity && f.checkValidity());
                    this.validActivateForm = check(this.$refs['account-activate-form']);
                    this.validUsername = check(this.$refs['activate-username']);
                }
            },
            template: /*HTML*/`
                <h4>Step 2: Activate Account...</h4>
                <form ref="account-activate-form" class="account-grid" v-debounce.keyup="validate">
                <div class="account-grid-c1">Username:</div>
                <div class="account-grid-c2">
                    <input class="account-input validated" type="text" placeholder="username" v-pattern:username required
                    ref="activate-username" v-model="name">
                    <span class="account-desc text-small" v-pattern:username.desc></span>
                </div>
                <div class="account-grid-c1">Code:</div>
                <div class="account-grid-c2">
                    <input class="account-input validated" type="text" placeholder="challenge code" ref="account-code" v-model="code"
                        v-pattern:code required @keyup.enter="codeCheck">
                    <span class="account-desc text-small" v-pattern:code.desc></span>
                </div>
                <div class="account-grid-c1"></div>
                <div class="account-grid-c2 stretch">
                <button class="account-button" type="button" :disabled="!validUsername" @click="codeRequest()">Text Code</button>
                <button class="account-button" type="button" :disabled="!validUsername" @click="codeRequest('mail')">eMail Code</button>
                <button class="account-button right" type="button" :disabled="!validActivateForm" @click="codeCheck">Activate</button>
                </div>
                <div class="account-grid-c1">Status:</div>
                <div class="account-grid-c2">
                    <span class="account-desc text-small" v-if-class:error="activate.error">{{ activate.msg }}</span>
                </div>
                </form>`
        },

        // component for user account management: status and user group membership
        'accnt-user-admin': {
            props: ['account', 'admin', 'groups'],
            computed: {
                membership() { return this.account.member.split(','); }
            },
            methods: { 
                chgSts(status) { this.$emit('update:account',{}.mergekeys(this.account).mergekeys({status: status})); },
                chgMbr(i,x) { 
                    let member = (x.checked ? [x.value].concat(this.membership) : this.membership.filter(f=>f!==x.value)).join(',');
                    this.$emit('update:account',{}.mergekeys(this.account).mergekeys({member: member}));
                }
            },
            template: /*HTML*/`
                <div class="account-grid-cx text-large text-bold">Administrative...</div>
                <div class="account-grid-c1">Status:</div>
                <div class="account-grid-c2">
                <select class="account-input validated" :value="account.status" @change="chgSts($event.target.value)">
                    <option v-for="c of SITE.statuses" :selected="account.status===c[1]" :value="c[1]">{{c[0]}}</option>
                </select>
                </div>

                <div class="account-grid-cx">Group Membership (Permissions)...</div>
                <template v-for="g,i in groups">
                    <div class="account-grid-c1">
                        <label class="text-bold"><input type="checkbox" name="group" :value="g.name" :checked="membership.includes(g.name)" 
                            :disabled="(g.name==='admin')&&!admin" @change="chgMbr(i,$event.target)"/>{{g.name}}</label>
                    </div>
                    <div class="account-grid-c2 stretch">{{g.desc}}</div>
                </template>`

        },

        // component for user credentials; model account => username and credentials modified
        'accnt-user-creds': {
            props: ['account', 'manage', 'valid'],
            data: ()=>({
                visible: false
            }),
            computed: {
                visIcon() { return this.visible ? 'visibility_off' : 'visibility'; }
            },
            methods: { 
                chg(field,value) { this.$emit('update:account',{}.mergekeys(this.account).mergekeys({[field]: value})); },
                chgCreds(field,value) { this.chg('credentials',{}.mergekeys(this.account.credentials).mergekeys({[field]: value})); }
            },
            template: /*HTML*/`
                <div class="account-grid-cx text-large">Credentials...</div>
                <div class="account-grid-c1">Username:</div>
                <div class="account-grid-c2">
                    <label v-show="valid" class="account-input text-bold">{{account.username}}</label>
                    <input v-show="!valid" class="account-input validated" ref="account-username" type="text"
                        placeholder="username" :value="account.username" v-pattern:username required autocomplete 
                        @input="chg('username',$event.target.value)">
                    <span v-show="!valid" class="account-desc" v-pattern:username.desc></span>
                </div>
                <div class="account-grid-c1">Password:</div>
                <div class="account-grid-c2">
                    <input class="account-input account-pw validated" autocomplete="off" ref="account-password" 
                        placeholder="password/code" :type="visible?'text':'password'" :value="account.credentials.password" 
                        v-pattern:password :required="!manage" @input="chgCreds('password',$event.target.value)">
                    <i class="account-eye" v-icon:[visIcon] @click.prevent="visible=!visible"></i>
                    <span class="account-desc" v-pattern:password.desc></span>
                    <span class="account-desc text-normal" v-if="manage">Leave blank to remain unchanged.</span>
                </div>
                <div class="account-grid-c1">Pin:</div>
                <div class="account-grid-c2">
                    <input class="account-input account-pw validated" autocomplete="off" ref="account-pin" placeholder="optional pin" 
                        :type="visible?'text':'password'" :value="account.credentials.pin" v-pattern:tag 
                        @input="chgCreds('pin',$event.target.value)">
                    <i class="account-eye" v-icon:[visIcon] @click.prevent="visible=!visible"></i>
                    <span class="account-desc" v-pattern:tag.desc></span>
                    <span class="account-desc text-normal" v-if="manage">Leave blank to remain unchanged.</span>
                </div>`
        },

        // component for user identification info, account (root values); model:account
        'accnt-user-identity': {
            props: ['account'],
            methods: { 
                chg(field,value) { this.$emit('update:account',{}.mergekeys(this.account).mergekeys({[field]: value})); }
            },
            template: /*HTML*/`
                <div class="account-grid-cx text-large">Personal Identification...</div>
                <div class="account-grid-c1">Fullname:</div>
                <div class="account-grid-c2">
                    <input class="account-input validated" type="text" placeholder="fullname" :value="account.fullname" 
                        v-pattern:fullname required autocomplete @input="chg('fullname',$event.target.value)">
                    <span class="account-desc" v-pattern:fullname.desc></span> 
                </div>
                <div class="account-grid-c1">Email:</div>
                <div class="account-grid-c2">
                    <input class="account-input validated" type="text" placeholder="email" :value="account.email" 
                        v-pattern:email required autocomplete @input="chg('email',$event.target.value)">
                    <span class="account-desc" v-pattern:email.desc></span>
                </div>
                <div class="account-grid-c1">Phone:</div>
                <div class="account-grid-c2">
                    <input class="account-input" v-if-class:validated="!!account.phone" type="text" placeholder="phone" 
                        :value="account.phone" v-pattern:phone :required="!!account.phone" autocomplete @input="chg('phone',$event.target.value)">
                    <span class="account-desc" v-pattern:phone.desc></span>
                    <span class="account-desc text-bold">Must be capble of receiving texts!</span>
                </div>`

        },

        // component for site specific user data "other"; model:other
        'accnt-user-other': {
            props: ['other'],
            emits:['keyup','update:other'],    // keyup for form to capture changes
            computed: { units() { return SITE[this.other.account==='client'?'apts':'offices'][this.other.location] || []; } },
            methods: { 
                chg(field,value) { this.$emit('update:other',{}.mergekeys(this.other).mergekeys({[field]: value})); this.$emit('keyup') }
            },
            template: /*HTML*/`
                <div class="account-grid-cx text-large">Other...</div>
                <div class="account-grid-c1">Account:</div>
                <div class="account-grid-c2">
                    <select class="account-input validated" :value="other.account" required @change="chg('account',$event.target.value)">
                        <option disabled :selected="other.account==''" value=''>Please select one ...</option>
                        <option v-for="c of SITE.accounts" :selected="other.account===c[1]" :value="c[1]">{{c[0]}}</option>
                    </select>
                    <span class="account-desc">Please select the appropriate account.</span>
                </div>
                <div class="account-grid-c1">Location:</div>
                <div class="account-grid-c2">
                    <select class="account-input validated" :value="other.location" required @change="chg('location',$event.target.value)">
                        <option disabled :selected="other.location==''" value=''>Please select one ...</option>
                        <option v-for="c of SITE.locations" :selected="other.location===c[1]" :value="c[1]">{{c[0]}}</option>
                    </select>
                    <span class="account-desc">Please select the appropriate location.</span>
                </div>
                <div class="account-grid-c1">Unit:</div>
                <div class="account-grid-c2">
                    <select class="account-input validated" :value="other.unit" required @change="chg('unit',$event.target.value)">
                        <option disabled :selected="other.unit==''" value=''>Please select one ...</option>
                        <option v-for="c of units" :selected="other.unit===c[1]" :value="c[1]">{{c[0]}}</option>
                    </select>
                    <span class="account-desc">Please select the appropriate apartment or office.</span>
                </div>`
        },

        // component for managing groups
        'account-groups': {
            props: ['admin','groups', 'users'],
            data: function () { return {
                chgdUsers: [],
                group: 'manager',
                localMembers: null
            }},
            computed: {
                groupDescriptions() { return this.groups.reduce((d,g)=>{ d[g.name]=g.desc; return d; },{}) },
                groupsNonAdmin() { return this.groups.filter(g=>g.name!=='admin') },
                members() {
                    let m = {}; this.groups.map(g=>m[g.name]=[]);
                    this.users.x1.map(u=>u.member.split(',').map(g=>m[g]?m[g].push(u.username):null));
                    return m;
                }
            },
            methods: {
                chgMbr(e) {
                    let {checked, value} = e.target;
                    if (!this.localMembers) this.localMembers = jsonCopy(this.members); // initialize local copy
                    let lg = this.localMembers[this.group];
                    this.localMembers[this.group] = checked ? lg.concat(value) : lg.filter(un=>un!==value);
                    this.cmpMbrshp();
                },
                cmpMbrshp() {
                    let chgdUsers = [];
                    this.groups.map(g=>g.name).forEach(gn=>{
                        let added = this.localMembers[gn].filter(u=>!this.members[gn].includes(u)); // added
                        let removed = this.members[gn].filter(u=>!this.localMembers[gn].includes(u)); // removed
                        chgdUsers = distinct(chgdUsers.concat(added).concat(removed));
                    });
                    this.chgdUsers = chgdUsers;
                },
                save() {
                    let chgd = this.chgdUsers.reduce((obj,un)=>{ obj[un]=[]; return obj},{})
                    this.groups.map(g=>{this.localMembers[g.name].map(un=>{if(this.chgdUsers.includes(un)) chgd[un].push(g.name)})})
                    this.$emit('change',chgd);
                    this.chgdUsers = [];
                }
            },
            template: /*HTML*/`
            <div class="account-grid">
                <div class="account-grid-c1">Group:</div>
                <div class="account-grid-c2">
                    <select class="account-input validated" v-model="group" @change.stop>
                        <option :inhibit="!admin" :value="'admin'">admin</option>
                        <option v-for="g in groupsNonAdmin" :selected="group==g.name" :value="g.name">{{g.name}}</option>
                    </select>
                </div>
                <div class="account-grid-c1">Desc:</div>
                <div class="account-grid-c2"><label class="text-small">{{groupDescriptions[group]}}</label></div>
                
                <div class="account-grid-c1">Members:</div>
                <div class="account-grid-c2">
                    <template v-for="u,i in users.x1">
                        <input type="checkbox" name="members" :checked="members[group]?.includes(u.username)" :value="u.username" 
                            @change.stop="chgMbr" />{{u.fullname}} ({{u.username}})<br>
                    </template>
                </div>
                <div class="account-grid-c1 text-bold">Changed:</div>
                <div v-show="chgdUsers.length" class="account-grid-c2 stretch text-bold">{{chgdUsers.join(', ')}}</div>
                <div class="account-grid-cx stretch"><button type="button" class="right" @click="save">Save</button></div>
            </div>`
        },

        // account dialog element to encapsulate user account interface...
        'dialog-account': {
            props: ['show','who'],
            data: ()=>({
                account: jsonCopy(SITE.account),    // account represents aggregated data sent for /user/change
                groups: [],
                manage: false,
                pending: false, // account changes
                report: null,
                selectedUser: '',
                step: 1,
                users: [],
                valid: { accountForm: false, timex: null, wait: 500 },
                view: 'user'
            }),
            computed: {
                admin() { return this.who.member.includes('admin'); },
                chgdGroups() { return this.groups.filter(g=>g.chgd).map(g=>g.name); },
                chgdUsers() { return this.users.filter(u=>u.chgd||(u.username===this.account.username&&this.pending)) },
                manager() { return this.admin || this.who.member.includes('manager'); },
                mode() { return this.manage ? 'Manage' : this.who.valid ? 'Edit' : 'Create'; },
                ready() { return  {
                    groups: !!this.groups.length,
                    users: !!(this.users.length&&this.usersOrdered.x1?.length),
                }},
                userIndexes() { return this.users.reduce((obj,u,i)=>{obj[u.username]=i; return obj;},{}); },
                usersOrdered() {
                    let orderedName = fn =>fn.replace(/(?:(.*) )?([^ ]+$)/,(m,t1,t2)=>t2+', '+t1);
                    let byName = (a,b) => a.name.localeCompare(b.name,{sensitivity:  "base"});
                    let ordered = this.users.map(u=>({ username:u.username, fullname: u.fullname, 
                        name: orderedName(u.fullname), member: u.member })).sort(byName);
                    let mid = Math.trunc((ordered.length+1)/2);
                    let usersX2 = ordered.reduce((x,v,i,a)=>i<mid?x.concat([a[i],a[i+mid]]):x,[]).filter(u=>u);
                    return { x1: ordered, x2: usersX2 };
                },
                userHdr() { return (this.mode==='Create' ? 'Step 1: ' : '') + this.mode + ' User...'; }
            },
            methods: {
                accountDo() {
                    if (this.manage && !this.userCmp()) {   // compare current account for changes
                        this.account.chgd = true;
                        this.userMerge();   
                    };
                    var body = this.manage ? this.users.filter(u=>u.chgd).map(ux=>({ref: ux.username, record: ux})) : 
                        [{ ref: this.account.username, record: this.account }];
                    let hdrs = this.who.token ? {authorization: `Bearer ${this.who.token}`} : {};
                    if (body.length===0) return;
                    this.fetchJSON('POST','/user/change',{ headers: hdrs, body: body } )
                        .then(res=>res.jxOK&&!res.jx.error ? res.jx : [])
                        .then(results=> { 
                            this.report = results;
                            this.users.forEach(u=>u.chgd=false)
                            this.account.chgd = false;
                        })
                        .catch(e=>{ this.report(e, e.toString()); console.error(e); });
                },
                chgMembers(usrMbrshp) {
                    let body = [];
                    usrMbrshp.mapByKey((mbrs,un)=>{
                        this.users[this.userIndexes[un]].member = mbrs.join(',');
                        body.push({ref: un, record: this.users[this.userIndexes[un]]});
                    });
                    this.fetchJSON('POST','/user/change',{ body: body, headers: {authorization: `Bearer ${this.who.token}`} })
                        .then(res=>res.jxOK&&!res.jx.error ? res.jx : [])
                        .catch(e=>{ console.error(e); });
                },
                userChg() {
                    if (this.account.username===this.selectedUser) return;
                    let {user,index} = this.userFind(this.account.username);
                    this.account.chgd = this.account.chgd || !this.userCmp(user.username);
                    if (this.account.chgd) this.userMerge(user.username);
                    this.account = {credentials: {password: '', pin:''}}.mergekeys(this.userFind(this.selectedUser).user);
                },
                userCmp(username) {
                    let compare = (original, copy) => Object.keys(original)
                        .map(ko=>typeof original[ko]=='object'?compare(original[ko],copy[ko]):original[ko]===copy[ko]).every(x=>x);
                    if (!this.manager) return;
                    return compare(this.userFind(username||this.account.username).user,this.account);
                },
                userFind(username) { return this.users.map((u,i)=>({user: u, index: i})).filter(u=>u.user.username===username)[0] },
                userMerge(username) { this.users[this.userFind(username||this.account.username).index] = {}.mergekeys(this.account); },
                modeChg() { this.manage = !this.manage; this.validate(); },
                fetchGroupsAndUsers() {
                    this.fetchJSON('GET','/user/users',{headers:{authorization: `Bearer ${this.who.token}`}})
                        .then(res=>{ return res.jxOK&&!res.jx.error ? res.jx : []; })
                        .then(users=>{ users.forEach(u=>u.member.split(',').sort().join(',')); 
                            users.forEach(u=>u.credentials={password:'', pin:''}); this.users = users; })
                        .catch(e=>console.error("fetchGroupsAndUsers[users]:",e));
                    this.fetchJSON('GET','/user/groups',{headers:{authorization: `Bearer ${this.who.token}`}})
                        .then(res=>{ this.groups = res.jxOK&&!res.jx.error ? res.jx : []; })
                        .catch(e=>console.error("fetchGroupsAndUsers[groups]:",e));
                },
                validate(e) {
                    let check = f => !!(f && f.checkValidity && f.checkValidity());
                    this.valid.accountForm = this.manage || check(this.$refs['account-form']); // whole edit/create user form button enable
                }
            },
            watch: {
                show() {
                    if (!this.show || !this.who.valid) return;
                    if (this.account.username==='') {
                        this.account = jsonCopy(this.who).mergekeys({credentials: {password: '', pin: ''}});
                        this.selectedUser = this.who.username;
                    };
                    this.validate();
                    if (this.manager && this.users.length===0) this.fetchGroupsAndUsers();
                }
            },
            template: /*HTML*/`
                <div class="account-dialog" v-show="show">
                    <h3>Account Management<i class="wndw-icon" v-icon:close @click="$emit('close','account')" ></i>
                    <i class="wndw-icon" v-if-class:none="!manager" v-icon:people title="Manage Users" @click="modeChg"></i></h3>
                    <div v-show="!manage" class="text-indent">
                        <p class="text-dark text-bold">Privacy Notice: Information used only for account management and not shared 
                          with third parties.</p>
                        <span v-show="!who.valid">
                            <p class="text-bold">To change existing account information, please login first...</p>
                            <label class="text-bolder"><input type="radio" name="step" :value=1 v-model="step" />Create User</label>
                            <label class="text-bolder"><input type="radio" name="step" :value=2 v-model="step" />Activate Account</label>
                        </span>
                    </div>
                    <div v-show="manage" class="text-indent">
                        <label><input type="radio" name="view" :value="'user'" v-model="view" />Manage Users</label>
                        <label><input type="radio" name="view" :value="'group'" v-model="view" />Manage Groups</label>
                    </div>

                <form class="account-form" ref="account-form" v-debounce.keyup="validate">
                <div v-show="(manage && view==='user') || (!who.valid && step===1) || (!manage && who.valid)">
                    <h4>{{userHdr}}</h4>
                    <!-- Users list for when managing users... -->
                    <div class="account-grid" v-if="manage">
                        <div class="account-grid-c1">User:</div>
                        <div class="account-grid-c2">
                            <select v-model="selectedUser" @change="userChg">
                                <option v-for="u of usersOrdered.x1" :value="u.username">{{u.name}} ({{u.username}})</option>
                            </select>
                        </div>
                    </div>
                    <div class="account-grid">
                        <!-- Credentials... -->
                        <accnt-user-creds v-model:account="account" :manage="manage" :valid="who.valid"></accnt-user-creds>
                        <!-- Personal identification info... -->
                        <accnt-user-identity v-model:account="account"></accnt-user-identity>
                        <!-- Site specific info... -->
                        <accnt-user-other v-model:other="account.other"></accnt-user-other>
                        <!-- Administrative info for managers only... -->
                        <accnt-user-admin v-if="manage" :admin="admin" :groups="groups" v-model:account="account"></accnt-user-admin>
                    </div>
                    <!-- form submission and report... -->
                    <p class="clear" v-if="manage">Changed Users: {{chgdUsers.join(', ')}}</p>
                    <button type="button" class="right" :disabled="!valid.accountForm" @click="accountDo">{{ who.valid?'SAVE':'CREATE' }}</button> 
                    <div class="account-grid clear" v-if="report">
                    <div class="account-grid-cx text-large">Results...</div>
                    <div class="account-grid-c1">User</div>
                    <div class="account-grid-c2">Action</div>
                    <template v-for="rpt of report">
                        <div class="account-grid-c1 text-dark text-bolder">{{rpt.user}}</div>
                        <div class="account-grid-c2 text-dark text-bolder" v-if-class:text-alert="rpt.error">{{rpt.result?.action}}</div>
                    </template>
                    </div>

                </div>
                </form>

                <accnt-activate v-if="(!who.valid && step===2)" :username="account.username"></accnt-activate>

                <account-groups v-if="(manage && view==='group')&&ready.groups&&ready.users" :admin="admin" :groups="groups" 
                    :users="usersOrdered" @change="chgMembers"></account-groups>
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
                            if (creds.valid && this.show) this.$emit('close','login'); })
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
                }
            },
            watch: {
                show() { if (this.show) this.$nextTick(function() {this.$refs['login-username'].focus()}); }
            },
            template: /*HTML*/`
                <form class="login-dialog" ref="login-dialog" v-show="show">
                  <span class="login-text text-large">Sign in...<i class="wndw-icon" v-icon:close @click="$emit('close','login')" ></i></span>
                  <span class="login-text text-small text-italic">Enter your credentials...</span>
                  <input class="login-input validated" ref="login-username" type="text" placeholder="username" v-model="username" 
                    v-pattern:username required autocomplete="username" @input="chg">
                  <input class="login-input login-pw validated" :type="visible?'text':'password'" placeholder="password/code" 
                    v-model="password" v-pattern:password required autocomplete="current-password" @input="chg" @keyup.enter="login()">
                  <i class="login-eye" v-icon:[eyeIcon] @click.prevent="visible=!visible"></i>
                  <input type="button" class="login-button" :disabled="!usernameValid" @click.stop="getCode" value="GET CODE">
                  <input type="button" class="login-button" :disabled="!formValid" @click.stop="login()" value="SIGN IN">
                  <span class="login-link text-italic" @click="$emit('new')">Create Account</span>
                  <span class="login-msg text-small"  v-if-class:text-error="error">{{ msg }}</span>
                </form>`
        },
        
        // logout dialog element to encapsulate user logout interface...
        'dialog-logout': {
            props: ['show', 'who'],
            methods: {
                logout() {
                    if (!this.who.token) return;  // only logout if user is logged in
                    this.fetchJSON('GET','/logout',{headers: {authorization: `Bearer ${this.who.token}`}})
                        .then(res=>{ 
                            if (res.error||res.jxError) throw `Logout failed... ${res.jx}`;
                            if (this.storage.jwt) { this.storage.jwt = undefined; };
                            this.$emit('logout',res.jx);
                            })
                        .catch(e=>{ console.error("logout:",e); this.$emit('error',e); });
                }        
            },
            template: /*HTML*/`
                <span class="identity" v-tip="'logout'" v-show="show" @click="logout">
                    {{ who.fullname }}<br />as {{ who.username }}<i class="id-icon" v-icon:cancel></i>
                </span>`
        },

    },

}

export default siteLib;
