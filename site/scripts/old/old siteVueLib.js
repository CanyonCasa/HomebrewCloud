// site dialogs and customization Vue library...


// Site specific lazy load dependencies data needed for autoload component...
// Extends Vue.prototype.$$app declared in VueLib.js
Vue.prototype.$$app.lazy = {
    files: {
        mine: { sources: ['d3','miningLib','mcss'] },
        family: { sources: ['flib','fcss'] },
        md: { sources: ['mdIt','attrs','lnk','div','span'], done: 'defineMarkdown' },
        mdIt: { type:'script', src: '/cdn/markdown-it/8.4.2/markdown-it.min.js' }, 
        attrs: { type:'script', src: '/cdn/markdown-it/markdown-it-attrs.min.js' },
        lnk: { type:'script', src: '/cdn/markdown-it/markdown-it-link-plus.min.js' },
        div: { type:'script', src: '/cdn/markdown-it/markdown-it-div.min.js' },
        span: { type:'script', src: '/cdn/markdown-it/markdown-it-span.min.js' },
        d3: { type:'script', src: '/cdn/d3/d3.js' },
        flib: { type:'script', src: '/scripts/familyLib.js' },
        fcss: { type:'stylesheet', src: '/styles/family.css' },
        miningLib: { type: 'script', src: '/scripts/miningLib.js' },
        mcss: { type:'stylesheet', src: '/styles/mining.css' }
    },
    // define Markdown render instance creation function needed as callback...
    defineMarkdown: function () {
        let md = window.markdownit('commonmark')
        .use(markdownItAttrs).use(markdownitLinkPlus).use(markdownitDiv).use(markdownitSpan);
        window.md2html = function(content,strip=false) {
            let rendered = md.render(content);
            return strip ? rendered.replace(/^<p>|<\/p>(?:\n)?$/gm,'') : rendered;
        }
    }
};


// account dialog element to encapsulate user account interface...
Vue.component('dialog-account', {
    props: ['show','who'],
    data: ()=>({
        account: { email: '', fullname: '', member: '', password: '', phone: '', status: '', username: '',
          other: { ref: '', account: '' } },
        activate: { code: '', msg: '' },
        chgdUser: false,
        chgdUsersSet: new Set(),
        error: false,
        field: {
          accountTypes: [["Guest",'guest'],["Family",'family'],["Admin",'admin'],["API",'api']],
          refChoices: [['IoT','iot'],['Special','*']],
          statusChoices: [["Pending Activation",'PENDING'],["Active User",'ACTIVE'],["Inactive (disabled)",'INACTIVE']],
        },
        fields: { email: '', fullname: '', member: '', password: '', pin: '', phone: '', status: 'INACTIVE', username: '',
          other: { ref: '', account: '' } },
        filter: true,
        group: { name: '', desc: '' },
        groups: [],
        manage: false,
        msg: '',
        other: { ref: '', account: '' },
        selectedUser: '',
        users: [],
        validAccountForm: false,
        validActivateForm: false,
        validUsername: false,
        visible: false
    }),
    computed: {
        admin() { return this.isMember('admin',this.who.member); },
        manager() { return this.isMember('admin,manager',this.who.member); },
        mode() { return this.manage ? 'Manage' : this.who.valid ? 'Edit' : 'Create'; },
        usersList() { return this.users.map(u=>({value:u.username, label:u.fullname+' ('+u.username+')'})); },
        valid() { return this.who && this.who.valid; },
        visIcon() { return this.visible ? 'visibility_off' : 'visibility'; }
    },
    //created() { window.account = this; },
    methods: {
      accountDo() {
        if (!(this.who || this.who.token)) return;
        if (this.chgdUser) this.userMerge();
        if (this.chgdUsersSet.size==0) return;
        var body = this.manage ? this.users.filter(u=>this.chgdUsersSet.has(u.username)).map(ux=>({ref: ux.username, record: ux})) : 
          [{ ref: this.account.username, record: this.account }];
        console.log(`body: ${JSON.stringify(body)}`);
        let hdrs = this.who.token ? {authorization: `Bearer ${this.who.token}`} : {};
        this.fetchJSON('POST','/user/change/',{ headers: hdrs, body: body } )
          .then(res=>{ 
            this.error = res.error || res.jxError;
            if (this.error) return this.msg=`Account operation failed; username may exist; First login to change existing user.`;
            let queue = [];
            res.jx.forEach(u=>{
            let msg = u[0]=='error' ? `Account operation failed for user ${u[1]} (${u[2].code}:${u[2].msg})` : 
              `Account operation successful for user ${u[1]}`;
            queue.push(msg);});
            this.msg = queue.join('<br>');
            this.chgdUsersSet.clear(); })
          .catch(e=>{ this.error=true; this.msg=e.toString(); });
      },
      chg(e) {
        this.chgdUser = true;
        this.chgdUsersSet.add(this.selectedUser);
        this.validateForms();
      },
      chgGroup(action) {
        if (!this.who || !this.who.token) return;
        if (action=='name') { this.group.desc = (this.groups[this.group.name]||{}).desc || ''; return; };
        if ((action=='add') && scanForMatchTo(this.groups,{name: this.group.name},null)) return;  // do not add existing group
        if ((action=='edit') && !scanForMatchTo(this.groups,{name: this.group.name},null)) return;  // do not edit non-existing group
        let tmp = [{ref: this.group.name, record: action=='del' ? null : this.group}];
        switch (action) {
            case 'edit': this.groups.map((g,i)=>this.groups[i].desc = g.name==this.group.name ? this.group.desc : g.desc); break;
            case 'add': this.groups.push({name: this.group.name, desc: this.group.desc}); break;
            case 'del': this.groups = this.groups.filter(g=>g.name!=this.group.name); break;
        };
        this.fetchJSON('POST','/user/groups/',{ headers: {authorization: `Bearer ${this.who.token}`}, body: tmp} )
          .then(res=>{ if (res.error || res.jxError) { console.error('Failed to update groups...'); return; }; })
          .catch(e=>{ this.error=true; console.error("ERROR: Post groups failed..."); this.msg=e.toString(); });
      },
      chgMember(group,chkd) { this.chgMembers(group,chkd,this.account.username); this.chg(); },
      chgMembers(group,chkd,user) {
        let usr = scanForMatchTo(this.users,{username:user},{});
        let ms = new Set(usr.member.split(','));
        chkd ? ms.add(group) : ms.delete(group);
        usr.member = [...ms].join(',');
        this.chgdUsersSet.add(user);
        if (this.account.username==user) this.account.member = usr.member; 
        this.validateForms();
      },
      chgOther() { this.account.other = this.other; this.validateForms(); },
      chgUser(user) {
        if (this.selectedUser!=user) this.selectedUser = user;
        this.userMerge();
        let ux = scanForMatchTo(this.users,{username:user},jsonCopy(this.fields));
        var setAccount = (a,u)=> a.mapByKey((v,k)=>typeof v=='object' ? setAccount(v,u[k]) : u[k]||'');
        this.account = setAccount(this.fields,ux);
        this.other = setAccount(this.fields.other,ux.other);
        this.$nextTick(function() {this.$refs['account-username'].focus()});
      },
      codeCheck() { 
        this.fetchJSON('POST','/user/code/'+this.account.username+'/'+this.activate.code)
          .then(res=>{ this.error = !!res.jx.error; this.activate.msg = res.jx.msg; })
          .catch(e=>{ this.error=true; this.activate.msg=e.toString(); });
      },
      codeRequest() {
        this.fetchJSON('GET','/user/code/'+this.account.username)
          .then(res=>{ this.error = !!res.jx.error; this.activate.msg = res.jx.msg; })
          .catch(e=>{ this.error=true; this.activate.msg=e.toString(); });
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
      see() { this.visible = !this.visible; },
      userMerge() { // merge changes to user if changed
        if (!this.chgdUser) return;
        let existingUser = scanForMatchTo(this.users,{username:this.account.username},null);
        if (existingUser) { existingUser.mergekeys(this.account); } else { this.users.push(jsonCopy(this.account)); };
        this.chgdUser = false;
      },
      validateForms() {
        this.validAccountForm = this.manage || this.$refs['account-form'].checkValidity(); // whole account form button enable
        if (this.$refs['account-activate-form']) this.validActivateForm = this.$refs['account-activate-form'].checkValidity();
        this.validUsername = this.$refs['activate-username'].checkValidity();
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
        <blk-x hdr="Credentials..." inhibit="true" init="true">
          <label class="account-label">Username:</label>
            <label v-show="valid" class="account-input text-bold">{{account.username}}</label>
            <input v-show="!valid" class="account-input validated" ref="account-username" type="text" 
              placeholder="username" v-model="account.username" v-pattern:username required autocomplete @input="chg">
            <span class="account-desc" v-pattern:username.desc></span>
          <label class="account-label">Password:</label>
          <span>
            <input class="account-input account-pw validated" autocomplete="off" ref="account-password" placeholder="password/code" 
              :type="visible?'text':'password'" v-model="account.password" v-pattern:password :required="!manage" @input="chg">
            <i class="account-icon" v-icon:[visIcon] @click.prevent="see"></i>
            <i class="account-icon" v-if-class:none="!manage" v-icon:cached title="Reset password" @click.stop="resetPW"></i>
          </span>
          <span class="account-desc" v-pattern:password.desc></span>
        </blk-x>
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
          <span class="account-msg">Other...</span>
          <label class="account-label">Account:</label>
          <select class="account-input validated" v-model="other.account" required @change="chgOther">
            <option disabled :selected="other.account==''" value='none'>Please select one ...</option>
            <option v-for="c of field.accountTypes" :selected="other.account==c[1]" :value="c[1]">{{c[0]}}</option>
          </select>
          <span class="account-desc">Please select the appropriate type.</span>
          <label class="account-label">Reference:</label>
          <select class="account-input validated" v-model="other.ref" required @change="chgOther">
            <option disabled :selected="other.account==''" value=''>Please select one ...</option>
            <option v-for="c of field.refChoices" :selected="other.account==c[1]" :value="c[1]">{{c[0]}}</option>
          </select>
          <span class="account-desc">Please select the appropriate reference.</span>
        </blk-x>
        <blk-x v-if="manage" hdr="Administrative...">
          <label class="account-label">Status:</label>
          <select class="account-input validated" v-model="account.status" @change="chg">
            <option v-for="c of field.statusChoices" :value="c[1]">{{c[0]}}</option>
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
          <template v-show="admin">
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
        <input type="button" class="account-button" :disabled="!validAccountForm" @click.stop="accountDo" 
          :value="valid?'EDIT ACCOUNT'+((chgdUsersSet.size==1)?'':'S'):'SIGN UP'">
        <div class="text-small"  v-if-class:text-error="error">{{ msg }}</div>
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
        <span class="account-desc text-alert text-small" v-if-class:error="error">{{ activate.msg }}</span>
      </form>
      </div> 
    </div>`
  });
  
  
  // login dialog element to encapsulate user login interface...
  Vue.component('dialog-login', {
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
    created() { this.$parent.$on('logout', this.logout); },
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
        var auth = token ? `Bearer ${token}` : `Basic ${btoa(this.username+":"+this.password)}`;// authorization header
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
      logout() {  // called when logout event emitted by parent
        if (!this.token) return;  // only logout if user is logged in
        this.fetchJSON('GET','/logout',{headers: {authorization: `Bearer ${this.token}`}})
          .then(res=>this.notify(res.jx)).catch(e=>{ console.error(e); this.$emit('error',e); });
      },
      notify(creds={}) {
        this.error = creds.error || false;   // set local variables and store payload and token - valid or not
        this.msg = creds.msg || '';
        this.token = creds.token || '';
        this.storage.local =  { jwt: creds.valid ? { token: creds.token, payload: creds.payload } : undefined };
        let user = { member: '', token: this.token, valid: !!creds.valid }.mergekeys(creds.payload);   // define user
        this.username = user.username || '';  // update username field
        this.$emit('user',user);              // pass user credentials to parent level
      },
      restoreCreds() {
        if (!this.storage.jwt) return;
        let { payload, token } = this.storage.jwt;
        let valid = payload && 1000*(payload.iat+payload.exp) > new Date().valueOf();
        let creds = valid ? { valid: true, token: token, payload: payload, error: false, msg: '' } :
            { valid: false, error: true, msg: 'Invalid or Expired login token' };
        this.notify(creds);
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
      <span class="login-text text-small text-italic">Enter a valid username and password/code...</span>
      <input class="login-input validated" ref="login-username" type="text" placeholder="username" v-model="username" 
        v-pattern:username required autocomplete="username" @input="chg">
      <span class="login-desc" v-pattern:username.desc></span>
      <input ref="lgnPW" class="login-input login-pw validated" type="password" placeholder="password/code" v-model="password" 
        v-pattern:password required autocomplete="current-password" @input="chg" @keyup.enter="login()">
      <i class="login-eye" v-icon:[eyeIcon] @click.prevent="see"></i>
      <span class="login-desc" v-pattern:password.desc></span>
      <input type="button" class="login-button" :disabled="!usernameValid" @click.stop="getCode" value="GET CODE">
      <input type="button" class="login-button right" :disabled="!formValid" @click.stop="login()" value="SIGN IN">
      <span class="login-msg text-small"  v-if-class:text-error="error">{{ msg }}</span>
    </form>`
  });
  
  