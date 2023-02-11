// Homebrew LiteCMS library...

// defaults and definitions for building schema...
const schemaDefinitions = {
  elements: {
    $root: {
      description: 'A new empty element...',
      data: null,
      element: '',
      label: '',
      name: '',
      notes: [],
      readonly: false
    },
    boolean: {
      data: false,
      description: 'BOOLEAN Element...',
      element: 'boolean',
      label: 'BOOLEAN',
      name: 'boolean',
      valueFalse: false,
      valueTrue: true
    },
    container: {
      children: [],
      container: 'unordered',
      description: 'A new collection (container element)...',
      element: 'container',
      label: 'UNORDERED CONTAINER',
      name: 'container'
    },
    date: {
      description: 'A date/time entry...',
      element: 'datetime',
      format: 'datetime',
      label: 'DATETIME',
      name: 'datetime'
    },
    enumerated: {
      choices: [],
      description: 'A list of choices...',
      element: 'enumerated',
      label: 'CHOICE',
      multiple: false,
      name: 'choice'
    },
    link: {
      description: 'A hyperlink element...',
      element: 'link',
      expire: false,
      label: 'LINK',
      link: {action:'href', analytics:'', expires:'', external:'', format:'anchor', image:'', link:'', ref:'', target:'', text:''},
      name: 'link'
    },
    numeric: {
      description: 'NUMERIC Element...',
      element: 'numeric',
      label: 'NUMERIC',
      max: '',
      min: '',
      name: 'numeric'
    },
    text: {
      auto: '',
      block: false,
      description: 'A string or block of text...',
      element: 'text',
      format: 'text',
      label: 'TEXT',
      name: 'text',
      pattern: '.*'
    }
  },
  schema: {
    children: [],
    container: 'unordered',
    description: 'A new empty schema...',
    data: {},
    element: 'schema',
    files: {
      store: '',
      data: 'untitled.json',
      schema: 'untitled.json'
    },
    label: 'UNSAVED',
    history: [],
    notes: [],
    series: null,
    version: window.cmsLiteCfg.version
  },
  series: {
    active: null,       // index of active post
    categories: '',     // defines available filing categories as comma delimited list
    filespec: '',
    data: '',           // placeholder for all posts
    //index: [],        // index added as needed
    meta: {
      author: '',
      brief: '',
      categories: '',   // filing categories for posting as comma delimited list
      dtd: '',
      element: 'article',
      file: '', 
      keywords: '',
      template: 'post', // Vue render component, visible to developer only
      title: ''
    },
  }
};


// Vue component definitions for CMS page...

// expandable block wrapper component...
Vue.component('cms-x',{
  computed: {
    expandIcon: function() { return this.expanded ? 'expand_less' : 'expand_more'; },
  },
  data: function() { return {expanded: !!this.init || false}; },
  props: ['hdr', 'init'],
  methods: {
    expand: function(state) { this.expanded = typeof state==='boolean' ? state : !this.expanded; }
  },
  template: `
    <div class="cms-x">
      <div class="cms-x-hdr" @click.stop="expand"><i v-icon:[expandIcon]></i> {{hdr}}</div>
      <div class="cms-x-slot" v-if-class:none="!expanded"><slot></slot></div>
    </div>`
});

// expandable block wrapper component...
Vue.component('cms-show',{
  props: ['hdr', 'show', 'test'],
  template: `
    <div v-if-class:none="!(show==test)" class="cms-show">
      <div class="hdr">{{hdr}}</div>
      <div class="slot"><slot></slot></div>
    </div>`
});

// a collection of menu bars used in CMS app...
// each menu item is array of [<icon-name>,<pick-value>,<title/tip>,<optional-filter>]
Vue.component('cms-icon-bar', {
  computed: {
    validMenuIcons: function() { return this.filter ? this.menus.mapByKey(m=>m.filter(i=>i[3]!==this.filter)) : this.menus; }
  },
  data: () =>({
    menus: {
      add: [
        ['ico-tree','container','Container (Object or Array)'],
        ['format_quote','text','String or block of text'],
        ['link','link','Hyperlink'],
        ['today','date','Date/Time Picker'],
        ['list','enumerated','Enumerated (List of Choices)'],
        ['check_circle','boolean','Boolean (True/False'],
        ['plus_one','numeric','Bounded Number'],
        ['close','close','Close']
      ],
      container: [
        ['content_copy','copy','Copy current container'],
        ['ico-menu4','up','Move container up'],
        ['ico-menu3','down','Move container down'],
        ['format_indent_decrease','promote','Move to parent container'],
        ['format_indent_increase','demote','Move container under sibling element'],
        ['delete','delete','Remove container from schema (CTRL)'],
        ['add_box','add','Add schema element to current element']
      ],
      element: [
        ['content_copy','copy','Copy current element'],
        ['ico-arrow-up','up','Move element up'],
        ['ico-arrow-down','down','Move element down'],
        ['ico-arrow-left','promote','Move to parent element'],
        ['ico-arrow-right','demote','Move element under sibling element'],
        ['delete','delete','Remove element from schema (CTRL)']
      ],
      info: [
        ['ico-image','upload','Upload a site resource'],
        ['cloud_upload','publish','Publish a schema definition'],
        ['cloud_download','load','Download a schema definition'],
        ['ico-db','data','Schema data editor and result','developer'],
        ['info','define','Define schema info','developer']
     ],
      schema: [
        ['add_box','add','Add (root) schema element']
      ]
    }
  }),
  methods: {
    pick: function(pk,evt) { this.$emit('pick', this.bar, pk, evt); }
  },
  props: ['bar','filter'],
  template: `
    <div :class="'cms-ibar cms-ibar-' + bar">
      <i class="cms-ibar-icon" v-for="icon in validMenuIcons[bar]||[]" :key="icon[0]" v-icon:[icon[0]] :title="icon[2]" @click.stop="pick(icon[1],$event)"></i>
    </div>`
});

// notes block used in schema and element definitions...
Vue.component('cms-notes',{
  data: function() { return { edit:-1, model:this.notes.slice(), newNote:'' }; },
  methods: {
    action: function(act,arg) {
      switch (act) {
        case 'add': if (this.newNote) { this.model.push(this.newNote); this.newNote = ''; }; break;
        case 'chg': this.edit = -1; break;
        case 'del': this.model.splice(arg,1); break;
        case 'edit': this.edit = arg; break;
      }; 
    this.$emit('chg',this.model);
    }
  },
  props: ['notes','view'],
  template: `
    <div class="notes">
      <cms-x class="notes-edit" v-if="view=='edit'" :hdr="'Notes:'">
        <div class="cms-note-grid" v-for="note,i in model">
          <span class="cms-note-note" v-if-class:none="edit==i">{{ i+1 }}. {{ note }}</span>
          <span class="cms-note-icons" v-if-class:none="edit==i"><i v-icon:edit @click.stop="action('edit',i)">
            </i><i v-icon:delete @click.stop="action('del',i)"></i></span>
          <label class="cms-note-note cms-note-stretch" v-if-class:none="edit!=i">{{ i+1 }}. <input type="text" v-model="model[i]" @click.stop /></label>
          <div class="cms-note-icons" v-if-class:none="edit!=i"><i v-icon:check @click.stop="action('chg',i)"></i></div>
        </div>
        <div class="cms-note-grid">
          <input class="cms-note-note cms-note-stretch" type="text" v-model="newNote" :placeholder="'Enter new note here...'" @click.stop />
          <div class="cms-note-icons"><i v-icon:add_circle_outline @click.stop="action('add')"></i></div>
        </div>
      </cms-x>
      <template v-if="view=='list'&&model&&model.length">
        <span class="cms-notes-hdr">Notes:</span>
        <ol class="cms-notes-list">
          <li class="cms-note-item" v-for="note in model">{{note}}</li>
        </ol>
      </template>
    </div>`
});

// a flexible base component for building scheam children...
Vue.component('cms-element',{
  computed: {
    offspring: function() { return this.isContainer ? ('('+this.element.children.length+' '+(this.element.children.length==1 ? 'child':'children')+')') : '' },
    expandIcon: function() { return this.expanded?'expand_less':'expand_more' },
    isContainer: function() { return this.model.element=='container'; },
    layout: function() { return this.element.element + (this.element.format ? ':'+this.element.format : ''); },
    line: function() { return [...this.lineage,{schema:this.element,index:this.index}]; },
    local: function() {return (this.model.element=='datetime') ? new Date(this.model.data).style('iso','local') : ''; },
    lock: function() { return this.element.readonly ? 'lock' : this.developer ? 'lock_open' : ''; },
    zulu: function() { return (this.model.element=='datetime') ? new Date(this.model.data).toISOString() : ''; }
  },
  created: function() {
    this.model = jsonCopy(this.element);
    if (this.model.data===null) {
      switch (this.model.element) {
        case 'link': this.chgLnk(); break;
        case 'datetime': this.chgDate(); break;
      };
    };
    this.xdata=this.cms.extractData(this.model); 
    this.bar=this.isContainer?'container':'element';
  },
  data: ()=>({
    bar: '',
    choice: { text: '', value: '', 'pick': undefined }, // enumerated element
    dateTimeFields: [],                                 // dateTime element
    expanded: false,
    model: {},
    view: '',
    xdata: null
  }),
  methods: {
    chg: function(evt,index,model) { // index and model undefined for base element changes; evt passed as placeholder for changes rippled to container
      if (this.isContainer) this.model.children[index] = model; // change specific child only
      this.$emit('chg', evt, this.index, this.model); // ripple changes up
    },
    chgDate: function() {
      let now = new Date().style('form');
      this.dateTimeFields = [this.model.format=='time' ? '1970-1-1' : this.dateTimeFields[0]||now[0], this.model.format=='date' ? '00:00' : this.dateTimeFields[1]||now[1]];
      this.model.data = new Date([this.dateTimeFields[0],this.dateTimeFields[1]].join(' ')).toISOString();
      this.chg();
    },
    chgEnum: function(act) {
      switch (act) {
        case 'add': 
          if (this.choice.text) { 
            this.model.choices.push([this.choice.text,this.choice.value||this.choice.text]); 
            this.choice.pick=this.model.choices.length;
            this.$nextTick(()=>{this.$refs['new-text'].focus();this.$refs['new-text'].select();});
          }; 
          break;
        case 'pick': if (this.choice.pick!==undefined) [this.choice.text,this.choice.value] = this.model.choices[this.choice.pick]; break;
        case 'up':
        case 'down':
          let p = this.choice.pick;
          let q = act=='up' ? p-1 : p+1;
          if(this.model.choices[q]!==undefined) { // reactive array swap; x and y need not be adjacent
            [this.model.choices[p],this.model.choices[q]] = [this.model.choices[q],this.model.choices[p]];
            this.choice.pick = q;
            this.chgEnum('pick');
          };
          break;
        case 'delete': this.model.choices.splice(this.choice.pick,1); break;
        case 'data': this.model.data = this.model.choices[this.choice.pick][1]; this.chg(); break;
      };
      this.chg();
    },
    chgLocus: function(action,evt,index,elx) { // only called from a child (or self add), evt holds mouse-click-info
      if (action=='promote') {
        this.$delete(this.model.children,index);  // remove child from parent, previously copied as elx
        this.$emit('locus','place',evt,this.index,elx); // pass clicked element (elx) to grandparent for placement relative to parent
      } else {
        this.cms.chgLocus(action,evt,index,elx,this.model); // use the root instance function to change locus
      };
      this.chg();
    },
    chgLnk: function() {
      let { action, analytics, expires, external, format, image, link, ref, text, target, data } = this.model.link;
      ref = ref ? (ref.startsWith('#') ? ref : '#'+ref) : '';
      expires = this.model.expire ? expires : '';
      target = external ? '"_blank"' : '';
      if (format=='anchor') {
        let dest = action=='href' ? `href="${link}${ref}"` : `href="" onclick="${link}${ref}"`;
        let atarget = external ? 'target="_blank"' : '';
        let img = image ? `<img src="${image}" alt="${text}" />` : null;
        this.model.data = `<a ${dest} ${atarget} title="${text}">${img ? img : text}</a>'`;
      } else {
        this.model.data = { action: action, analytics: analytics, expires: expires, external: external, image: image, link: link, 
          ref: ref, target: target, text: text };
      };
      this.chg();
    },
    chgLock: function() { if (this.developer) { this.model.readonly = !this.model.readonly; this.chg(); }; },
    chgNotes: function(notes) { this.model.notes=notes.slice(); this.$emit('chg', undefined, this.index, this.model); },
    edit: function(view) { this.expanded=this.view==view?!this.expanded:true; this.view=view; },
    expand: function() { this.view = this.developer ? this.view||'data' : 'data'; this.expanded = !this.expanded; },
    modelIs: function(t) { return this.model.element==t; },
    pick: function(bar,p,evt) {
      if(bar=='add') {
        if (p!='close') { this.cms.addElement(p,this.model.children); this.chg(); };  //if not close add new element
        this.bar='container';
      } else {  // container/element bar action
        if (p=='add') { this.bar='add'; } else { this.$emit('locus',p,evt,this.index,jsonCopy(this.model)); };
      };
    }
  },
  props: ['cms','developer','element','index','lineage','raw'],
  template:`
    <div v-if-class:element-block="!raw" v-if-class:data-span="raw" >
    
      <!-- always shown except when data editing -->
      <div v-if="!raw" @click.stop="expand">
        <div class="element-header">
          <span class="element-header-xicon"><i v-icon:[expandIcon]></i></span>
            <span class="element-header-lineage">{{[...lineage,''].map(a=>a?a.schema.label:'').join(' >> ')}}<span class="lineage-highlight">{{element.label}}</span></span>
              <span class="element-header-nav">
                <i v-if="developer" v-icon:build @click.stop="edit('schema')"></i>
                <i v-icon:edit class="" @click.stop="edit('data')"></i>
              </span>
        </div>
        <div v-show="expanded" class="element-header-subsection">
          <span class="element-header-xicon"><i v-icon:[lock] @click.stop="chgLock"></i></span>
            <span class="element-header-id element-header-desc">{{element.description}}</span>
              <span class="element-header-nav">
                <cms-icon-bar v-show="view=='schema'&&expanded" :bar="bar" @pick="pick"></cms-icon-bar>
              </span>
        </div>
      </div>
      
      <!-- shown when expanded and editing schema -->
      <div v-if="view=='schema'&&expanded" class="element-grid" @click.stop >
        <label class="element-col1" title="Display name of the element">Label:</label>
          <input type="text" class="element-col2" v-model="model.label" v-debounce.input="chg" />
        <label class="element-col3" title="Variable name reference in output">Name:</label>
          <input type="text" class="element-col4" v-model="model.name" v-debounce.input="chg" />
        <label class="element-col1" title="Brief description displayed with label">Description:</label>
          <input type="text" class="element-col2-4 stretch" v-model="model.description" v-debounce.input="chg"/>
        <label class="element-col1" title="Determines form of entering input data">Element Type:</label>
          <span class="element-col2"><span class="text-bold">{{$$app.frmt.uc(model.element)}}</span> {{offspring}}</span>
        <label class="schema-col3" title="Internal ID">ID:</label>
          <label class="schema-col4 text-bold">{{model.key}}</label>
      </div>
      
      <hr v-if="view=='schema'&&expanded" class="element-hr">

      <div v-if="view=='schema'&&expanded">
        <span v-if="modelIs('container')" class="element-grid">
          <label class="element-col1" title="Selects type of container">Type:</label>
          <span class="element-col2-4">
            <label><input type='radio' name="container" value="ordered" v-model="model.container" @change="chg" @click.stop />Ordered (Array)</label>
            <label><input type='radio' name="container" value="unordered" v-model="model.container" @change="chg" @click.stop />Unordered (Object)</label>
          </span>
        </span>
        <span v-else-if="modelIs('text')" class="element-grid">
          <label class="element-col1" title="Enables multi-line text input">
            <input type="checkbox" v-model="model.block" @change="chg"/>Block</label>
          <span class="element-col2-3">
            <label title="Format of text input">Format:</label>
            <label><input type='radio' name="format" value="text" v-model="model.format" @change="chg" />Text</label>
            <label><input type='radio' name="format" value="md" v-model="model.format" @change="chg" />Markdown</label>
            <label><input type='radio' name="format" value="html" v-model="model.format" @change="chg" />HTML</label>
          </span>
          <label class="element-col4" title="Format of output text">
            <input type="checkbox" false-value="" true-value="html" v-model="model.auto" @change="chg"/>Translate to HTML</label>
          <label class="element-col1" title="Filter user input">Pattern:</label>
            <input type="text" class="element-col2" v-model="model.pattern" v-debounce.input="chg"/>
        </span>
        <span v-else-if="modelIs('link')" class="element-grid">
          <label class="element-col1" title="Form output data">Format:</label>
          <span class="element-col2">
            <label><input type='radio' name="lnk-frmt" value="object" v-model="model.link.format" @change="chgLnk" />JS Object</label>
            <label><input type='radio' name="lnk-frmt" value="anchor" v-model="model.link.format" @change="chgLnk" />Anchor</label>
          </span>
          <label class="element-col3" title="Action Reference">Tag Action:</label>
          <span class="element-col4">
            <label><input type='radio' name="lnk-actn" value="href" v-model="model.link.action" @change="chgLnk" />href</label>
            <label><input type='radio' name="lnk-actn" value="anchor" v-model="model.link.action" @change="chgLnk" />click</label>
          </span>
          <label class="element-col2" title="Destination target">
            <input type="checkbox" v-model="model.link.external" @change="chgLnk"/>Target Blank Window/Tab</label>
          <label class="element-col4" title="Enable automatically expiring (hidden) link">
            <input type="checkbox" v-model="model.expire" @change="chgLnk"/>Enable Link Expiration</label>
        </span>
        <span v-else-if="modelIs('datetime')" class="element-grid">
          <label class="element-col1" title="Form of Date/time input">Field(s):</label>
          <span class="element-col2-4">
            <label><input type='radio' name="datetime" value="datetime" v-model="model.format" @change="chgDate" />Date and Time</label>
            <label><input type='radio' name="datetime" value="date" v-model="model.format" @change="chgDate" />Date</label>
            <label><input type='radio' name="datetime" value="time" v-model="model.format" @change="chgDate" />Time</label>
          </span>
        </span>
        <span v-else-if="modelIs('enumerated')" class="element-grid">
          <label class="element-col2" title="Enable multiple selections">
            <input type="checkbox" v-model="model.multiple" @change="chg"/>Allow multiple selections</label>
          <label class="element-col1" title="Selection text shown in dropdown">Selection:</label>
            <input type="text" class="element-col2" ref="new-text" v-model="choice.text" placeholder="Text displayed for choice"/>
          <label class="element-col3" title="Value for selection">Value:</label>
            <input type="text" class="element-col4" v-model="choice.value" placeholder="Output (default:selection)" @keyup.enter="chgEnum('add')" />
          <label class="element-col1" title="Choices">Choices:</label>
            <select class="element-col2" v-model="choice.pick" @change.stop="chgEnum('pick')">
              <option v-for="c,i of model.choices" :value="i">{{c[0]}}</option>
            </select>
          <span class="element-col3-4">
            <i v-icon:delete class="text-middle" @click.stop="chgEnum('delete')"></i>
            <i v-icon:arrow_upward class="text-middle" @click.stop="chgEnum('up')"></i>
            <i v-icon:arrow_downward class="text-middle" @click.stop="chgEnum('down')"></i>
            <i v-icon:add_circle_outline class="text-middle" @click.stop="chgEnum('add')"></i>
          </span>
        </span>
        <span v-else-if="modelIs('boolean')" class="element-grid">
          <label class="element-col1">False Value:</label>
            <input class="element-col2" type="text" v-model="model.valueFalse" placeholder="false" @click.stop @change="chg" />
          <label class="element-col3">True Value:</label>
            <input class="element-col4" type="text" v-model="model.valueTrue" placeholder="true" @click.stop @input="chg" />
          <label class="element-col1">Value:</label>
            <input class="element-col2" type="checkbox" :false-value="model.valueFalse" :true-value="model.valueTrue"
              v-model="model.data" @change.stop="chg" @click.stop />
        </span>
        <span v-else-if="modelIs('numeric')" class="element-grid">
          <label class="element-col1">Min:</label>
            <input class="element-col2" type="text" v-model="model.min" @click.stop @change="chg" />
          <label class="element-col3">Max:</label>
            <input class="element-col4" type="text" v-model="model.max" @click.stop @input="chg" />
        </span>
        <span v-else class="element-grid"><span class="element-span text-alert">"Unknown type: {{model.element}}"</span></span>
      </div>

      <!-- shows data entry form view -->
      <template v-if="raw||(view=='data'&&expanded)">
        <span v-if="modelIs('container')" class="data-grid">
          <span class="data-span">{{model.label}}:</span>
          <cms-element v-for="c,i in model.children" :key="c.name" :cms="cms" :developer="developer" :element="c" :index="i" :lineage="lineage" :raw="true"
            @chg="chg"></cms-element>
        </span>
        <span v-else-if="modelIs('text')" class="data-grid">
          <template v-if="!model.block">
            <span class="data-col1">{{model.label}}</span>
            <input v-if="!model.block" type="text" class="data-col2-4 stretch" :disabled="model.readonly" :pattern="model.pattern"
              v-model:value="model.data" v-debounce="chg" />
          </template>
          <template v-if="model.block">
            <span class="data-span">{{model.label}}:</span>
            <textarea class="data-span stretch" v-model:value="model.data" :readonly="model.readonly"
              v-autosize v-debounce.input="chg" @click.stop></textarea>
            <cms-x v-if="model.auto" class="data-span stretch" hdr="Generated Output...">
              <div class="auto-text-block" v-html="xdata"></div>
            </cms-x>
          </template>
        </span>
        <span v-else-if="modelIs('link')" class="data-grid">
          <label class="data-col1">Text:</label>
            <input class="data-col2 stretch" type="text" v-model="model.link.text" placeholder="Clickable link text"
              :disabled="model.readonly" @click.stop v-debounce.input="chgLnk" />
          <label class="data-col3">Image:</label>
            <input class="data-col4 stretch" type="text" v-model="model.link.image" placeholder="Image as clickable link"
              :disabled="model.readonly" @click.stop v-debounce.input="chgLnk" />
          <label class="data-col1">Link To:</label>
            <input class="data-col2-4 stretch" type="text" v-model="model.link.link" placeholder="Link source (prefix w/# for local)"
              :disabled="model.readonly" @click.stop v-debounce.input="chgLnk" />
          <label class="data-col1">Reference:</label>
            <input class="data-col2 stretch" type="text" v-model="model.link.ref" placeholder="Optional internal page #reference"
              :disabled="model.readonly" @click.stop v-debounce.input="chgLnk" />
          <label class="data-col3">Expiration:</label>
            <input class="data-col4" type="date" v-model="model.link.expires" :disabled="model.readonly" @click.stop v-debounce.change="chgLnk" />
          <label class="data-col1">Analytics:</label>
            <input class="data-col2-4 stretch" type="text" v-model="model.link.analytics" placeholder="Analytics information"
              :disabled="model.readonly" @click.stop v-debounce.input="chgLnk" />
        </span>
        <span v-else-if="modelIs('datetime')" class="data-grid">
          <label class="data-col1">Date:</label>
            <input class="data-col2" type="date" :disabled="(model.format=='time')||model.readonly" v-model="dateTimeFields[0]" @input="chgDate" />  
          <label class="data-col3">Time:</label>
            <input class="data-col4" type="time" :disabled="(model.format=='date')||model.readonly" v-model="dateTimeFields[1]" @input="chgDate" />  
          <label class="data-col1">Local:</label>
            <span class="data-col2-4">{{ local }}</span>
          <label class="data-col1">Zulu:</label>
            <span class="data-col2-4">{{ zulu }}</span>
        </span>
        <span v-else-if="modelIs('enumerated')" class="data-grid">
          <label class="data-col1" title="Choices">Data:</label>
            <select class="data-col2" v-model="choice.pick" @change.stop="chgEnum('data')">
              <option v-for="c,i of model.choices" :value="i">{{c[0]}}</option>
            </select>
        </span>
        <span v-else-if="modelIs('boolean')" class="data-grid">
          <label class="data-span"><input type="checkbox" :disabled="model.readonly" :false-value="model.valueFalse" :true-value="model.valueTrue"
            v-model="model.data" @click.stop @change="chg" />{{ model.description }} ({{model.valueFalse}}/{{model.valueTrue}})</label>
        </span>
        <span v-else-if="modelIs('numeric')" class="data-grid">
          <label class="data-col1">Value:</label>
          <input type="numeric" class="data-col2" :disabled="model.readonly" :min="model.min" :max="model-max"
            v-model:value="model.data" v-debounce="chg" />
          <label class="data-col3-4">MIN: {{model.min}}; MAX: {{model.max}}</label>
        </span>
        <span v-else class="text-pre">
          {{JSON.stringify(model,null,2)}}
        </span>
      </template>

      <!-- shown when expanded and viewing schema or data; view specific format -->
      <cms-notes v-if="!raw&&expanded" :notes=element.notes :view="view" @chg="chgNotes"></cms-notes>

      <!-- shown when expanded and viewing schema -->
      <cms-x class="element-contents" v-if="!raw&&expanded" hdr="Schema:">
        <span class="xschema">{{JSON.stringify(model,null,2)}}</span>
      </cms-x>

      <!-- shown when expanded and viewing schema or data -->
      <cms-x class="element-contents" v-if="view!=!raw&&expanded" hdr="Extracted Data:">
        <span class="xdata">{{JSON.stringify(xdata,null,2)}}</span>
      </cms-x>
      
      <!-- shown when expanded and element is a container -->
      <div class="element-children" v-if="(view=='schema')&&isContainer&&expanded">
        <cms-element v-for="child,i of element.children" :key="child.key" :cms="cms" :element="child" :index="i" 
          :lineage="line" :developer="developer" @chg="chg" @locus="chgLocus"></cms-element>
      </div>

    </div>`,
    watch: {
      'developer': function() { if (!this.developer) this.view = 'data'; },
      'element': function() {  this.model = jsonCopy(this.element); this.xdata=this.cms.extractData(this.model); }
    }
});

// a wrapper for the global schema information management...
Vue.component('cms-series',{
  computed: {
    categories: function() { return (this.series.categories||'').split(',').map(c=>c.trim()); },
    posts: function() { return this.series.index.map(p=>p.$meta); },
  },
  created: function() {
    this.series = this.newSeries().mergekeys({index:[]}).mergekeys(this.info);
    this.chkdCategories = (this.series.meta.categories||'').split(',').map(c=>c.trim());
    this.chgPost('clear');
  },
  data: ()=>({
    chkdCategories: [],
    series: {meta:{},index:[]},
    msg: ''
  }),
  methods: {
    chg: function() { this.$emit('chg', this.series); },
    chkd: function(e) { this.series.meta.categories = this.chkdCategories.join(','); },
    chgPost: function(action,num) {
      switch (action) {
        case 'clear': this.setSeriesContent(); break;
        case 'copy': this.setSeriesContent(num-1); this.series.active = null; break;
        case 'new': this.setSeriesContent(this.series.index.length-1); this.series.active = null; break;
        case 'edit': this.setSeriesContent((num||this.series.index.length)-1); break;
      };
      this.msg = this.series.active===null ? ('New Posting #'+(this.series.index.length+1)) : ('Editing Posting #'+(num||(this.series.index.length)));
      if ('posts' in this.$refs) this.$refs['posts'].expand(false);
      this.chg();
    },
    dtd: function(d,s) { return s ? new Date(d||new Date()).style('YYYYMMDD') : new Date(d||new Date()).style('iso','local') },
    newSeries: function() { return jsonCopy(schemaDefinitions.series).mergekeys({filespec: (this.site.cfg.publish||{}).series||'$u-p$p4-$v.json'}); },
    setSeriesContent: function (i) {
      if (this.series.index[i]) {
        this.series.meta = jsonCopy(this.series.index[i].$meta);
        this.series.data = jsonCopy(this.series.index[i].$data);
        this.series.active = i;
      } else {
        this.series.meta = this.newSeries().meta;
        this.series.data = {[this.series.meta.element]: ''};
        this.series.active = null;
      };
    }
  },
  props: ['info', 'notes', 'site'],
  template: `
    <cms-x class="schema-info-series" hdr="Series Post Meta Data (i.e.Blog Info)..." init="expanded">
      <div class="schema-grid">
      <label class="schema-col1">Post:</label>
        <label class="schema-col2 text-bold">{{msg}}</label>
        <span class="schema-col3-4">
          <input type='button' value="EDIT" @click="chgPost('edit')" />
          <input type='button' value="NEW" @click="chgPost('new')" />
          <input type='button' value="CLEAR" @click="chgPost('clear')" />
        </span>
        <cms-x class="schema-col2-4 stretch text-small" ref="posts" hdr="Previous Posts...">
          <div class="schema-grid">
            <template v-for="p,i in posts.slice().reverse()">
              <span class="schema-col1">#{{ posts.length-i }}
                <i class="text-middle" title="Copy for edit..." v-icon:content_copy @click="chgPost('copy',posts.length-i)"></i>
                <i class="text-middle" title="Open for edit..." v-icon:edit @click="chgPost('edit',posts.length-i)"></i>
              </span>
              <span class="schema-col2-4 text-small">{{ p.title }}, {{ p.brief }}<br>
                <span class="text-small">by {{ p.author }}, {{ dtd(p.dtd) }}, file: {{ p.file }}</span>
              </span>
            </template>
          </div>
        </cms-x>
      <label class="schema-col1">Title:</label>
        <input type="text" class="schema-col2-4 stretch" v-model="series.meta.title" />
      <label class="schema-col1">Author:</label>
        <input type="text" class="schema-col2 stretch" v-model="series.meta.author" />
      <label class="schema-col3">Dated:</label>
        <label class="schema-col4" title="Note: Updated at publication">{{series.meta.dtd}}</label>
      <label class="schema-col1" title="A one-line description of the post content...">Brief:</label>
        <input type="text" class="schema-col2-4 stretch" v-model="series.meta.brief" />
      <label class="schema-col1" title="A comma separated list of search keywords...">Keywords:</label>
        <input type="text" class="schema-col2-4 stretch" v-model="series.meta.keywords" />
      <label class="schema-col1">Categories:</label>
        <span class="schema-col2-4 stretch">
          <label v-for="c in categories"><input type="checkbox" name="categories" :value="c" v-model="chkdCategories" @change="chkd"/>{{c}}</label>
        </span>
      <label class="schema-col1" title="Page template used for layout">Template:</label>
        <label class="schema-col2 text-bold">{{series.meta.template}}</label>
      <label class="schema-col3" title="Element containing content">Element:</label>
        <label class="schema-col4 text-bold"">{{series.meta.element}}</label>

      <cms-notes class="schema-span" :notes=notes view="list"></cms-notes>

      </div>
    </cms-x>`
});

// a wrapper for the global schema information management...
Vue.component('cms-info',{
  computed: {
    backup: function() { return (this.site.cfg.publish||{}).backup || false; },
    clipboard: function() { return !!navigator.clipboard ? navigator.clipboard : null; },
    version: function() { return this.ver.startsWith(this.dtd(null,true)) ? this.ver.replace(/v(\d+)/,(m,n)=>'v'+(+n+1)) : this.dtd(null,true)+'v1'; },
    urls: function() { return this.site.cfg.urls || {}; },
    ver: function() { return this.model.version || this.dtd(null,true) + 'v0'; }
  },
  created: function() {
    this.model = jsonCopy(this.info);
    this.serial = !!this.model.series;
    if (this.serial) this.series = this.newSeries().mergekeys({index:[]}).mergekeys(this.model.series);
    this.xdata=this.cms.extractData(this.info);
  },
  data: ()=>({
    comment: '',
    dest: 'live',
    model: {files:{}},
    resource: { annotation: '', contents: '', dtd: '', exists: false, file: {}, folder: '', force: false, format: 'base64', 
      html:'', isImg: false, md: '', msg: '', path: '', preview: false, raw: '', saveAs: '', saveTo: '', store: '' },
    serial: false,
    series: {meta:{}},
    source: 'live',
    schemaSpec: {},
    spec: {},
    storeName: '',
    track: true,
    xdata: null
  }),
  methods: {
    chg: function(site) { this.$emit('chg', this.model, site); },
    chgSerial: function() {
      this.model.series = this.serial ? this.series : null;
      this.chg(); 
    },
    chgNotes: function(notes) { this.model.notes=notes.slice(); this.chg(); },
    chgRsrc: function(e) {
        let asSize = (b=0,m=1024)=>{let i=Math.floor(Math.log(b)/Math.log(m));
          return (b/Math.pow(m,i)).toFixed(i)+(['B','KB'][i]||'MB') };
      if (e&&e.target.files) {
        let file = e.target.files[0] || {};
        this.resource.file = {name: file.name, type: file.type, size: asSize(file.size), dtd: this.dtd(file.lastModified)};
        this.resource.isImg = this.resource.file.type.startsWith('image');
        this.resource.saveAs = this.resource.file.name.replace(/ /g,'_');
        this.resource.annotation = this.resource.saveAs.replace(/\.\w+$/,'').replace(/ /g,'_');
        var fReader = new FileReader();
          fReader.readAsDataURL(file);
          fReader.onloadend = event=>{
            this.resource.contents = event.target.result; // may be null for very large files
            this.$refs['preview'].src = this.resource.isImg ? this.resource.contents : '';
            let oversized = this.resource.contents && this.resource.contents.length > 8000000;
            let largeImg = this.resource.isImg && this.resource.contents.length > 250000;
            this.resource.msg = 
              this.resource.contents===null ? "File type or size NOT supported by browser!" : 
              oversized ? "File too large (<8M) to upload; must be uploaded via FTP." : 
              largeImg ? "Large images (>~200K) slow page load times, consider resizing before upload." : '';
          };
      };
      this.resource.valid = !!(this.resource.file.name && this.resource.saveTo && this.resource.saveAs);
      this.resource.exists = this.resource.valid && !!scanForMatchTo(this.site.stores.$resources[this.resource.saveTo],{name:this.resource.saveAs},null);
      this.resource.ok = !!((this.resource.valid && !this.resource.exists) || (this.resource.exists && this.resource.force));
      this.resource.folder = (this.resource.saveTo||'').replace(/\[(\w+)\].*/,'$1');
      this.resource.path = this.site.cfg.folders[this.resource.folder];
      this.resource.store = (this.resource.saveTo||'').split(']')[1]||'';
      this.resource.spec = makePath(this.resource.store,this.resource.saveAs||'undefined');
      this.resource.raw = makePath(this.resource.path,this.resource.store,this.resource.saveAs||'undefined');
      this.resource.md = this.resource.isImg ? `![${this.resource.annotation||this.resource.saveAs}](${this.resource.raw} "${this.resource.annotation}")` :
        `[${this.resource.annotation||this.resource.saveAs}](${this.resource.raw})`;
      this.resource.html = this.resource.isImg ? `<img src="${this.resource.raw}" alt="${this.resource.annotation}" />` :
        `<a href="${this.resource.raw}">${this.resource.annotation||this.resource.saveAs}</a>`;
    },
    chgSite: function() { this.chg({source: this.source}); },
    chgSpec: function(s) { this.spec = (s!=undefined) ? s : {}; },
    clpRsrc: function(r) { clipboard.writeText(this.resource[r]).then(()=>{console.log(`${this.resource[r]} copied to clipboard`);}).catch(e=>{console.error(e);}); },
    dtd: function(d,s,r) { return new Date(d||new Date()).style(s||'iso',r||'local'); },
    load: function() { if (this.storeName && verifyThat(this.schemaSpec,'isNotEmpty')) 
      this.$emit('act', 'load', {src:this.source, store: this.storeName, spec:this.schemaSpec}); },
    newSeries: function() { return jsonCopy(schemaDefinitions.series).mergekeys({filespec: (this.site.cfg.publish||{}).series||'$u-p$p4-$v.json'}); },
    preview: function() { this.resource.preview = !this.resource.preview; },
    publish: function() {
      let history = { author: this.who, dtd: new Date().style('iso'), note: this.comment, version: this.version };
      this.$emit('act', 'publish', { backup: this.backup, dest: this.dest, history: history });
      this.comment='' // prevent repeat form submission
    },
    toURL: function(d,f,s,x) { return makePath(this.urls[d||this.dest],this.site.cfg.folders[f],s,this.model.files[x]||x); },
    upload: function() { this.$emit('act', 'upload', this.resource); }
  },
  props: ['cms','expanded','info','msg', 'site','view','who'],
  template: `
    <div class="schema-info">

    <!-- shown when expanded -->
    <template v-if="expanded">
    
      <!-- Schema definition form -->
      <div v-if="view=='define'" class="schema-grid" @click.stop>
        <span class="schema-hdr">Schema Definition...</span>
        <label class="schema-col1" title="Display name of the element">Label:</label>
          <input type="text" class="schema-col2" v-model="model.label" @input="chg"/>
        <label class="schema-col3" title="Internal ID">ID:</label>
          <label class="schema-col4 text-bold">{{model.key}}</label>
        <label class="schema-col1" title="Brief description displayed with label">Description:</label>
          <input type="text" class="schema-col2-4 stretch" v-model="model.description" @input="chg"/>
        <label class="schema-col1" title="Defines root data type">Container:</label>
          <span class="schema-col2-4">
            <input type='radio' name="container" value="ordered" v-model="model.container" @change="chg" />Ordered (Array)
            <input type='radio' name="container" value="unordered" v-model="model.container" @change="chg" />Unordered (Object)
          </span>
        <label class="schema-col1" title="Subfolder for storing schema and data">Store/Folder:</label>
          <input type="text" class="schema-col2-4 stretch" v-model="model.files.store" @input="chg"/>
        <label class="schema-col1" title="Schema Filename">Schema File:</label>
          <input type="text" class="schema-col2" v-model="model.files.schema" @input="chg"/>
        <label class="schema-col3" title="Schema Filename">Data File:</label>
          <span class="schema-col4">
            <input type="text" v-model="model.files.data" @input="chg"/>
            <label title="Data Filename tracks schema filename"><input type="checkbox" v-model="track"/>Track</label>
          </span>
        <label class="schema-col1">Series ...</label>
        <label class="schema-col2-4" title="Enable series data">
          <input type="checkbox" v-model="serial" @change="chgSerial" />Enable Serial Mode</label>
        <!-- Optional Series definition form -->
        <template v-if="serial">
          <hr class="schema-span schema-hr">
          <label class="schema-col1" title="REQUIRED! Defines the Vue component template used to render the series files">Template:</label>
            <input type="text" class="schema-col2" v-model="series.meta.template" @input="chg"/>
          <label class="schema-col3" title="REQUIRED! Defines the data element included in the series files">Element:</label>
            <input type="text" class="schema-col4" v-model="series.meta.element" @input="chg"/>
          <label class="schema-col1" title="Filename template for serial posts">Filespec:</label>
            <input type="text" class="schema-col2" v-model="model.files.series" @input="chg"/>
          <label class="schema-col1" title="Display group filter for serial posts. Comma separated list of categories.">Categories:</label>
            <input type="text" class="schema-col2-4 stretch" v-model="series.categories" @input="chg"/>
        </template>
      </div>

      <!-- schema loader view -->
      <div class="schema-grid" v-if="view=='load'">
        <span class="schema-hdr">Load Schema...<span v-show="site.unsaved" class="text-warning">  NOTE: Current schema note saved!</span></span>
        <label class="schema-col1" title="Site from which to load schema">Source:</label>
          <span class="schema-col2">
            <input type='radio' name="source" value="preview" v-model="source" @chg="chgSite" />Preview
            <input type='radio' name="source" value="live" v-model="source" @chg="chgSite" />Live
          </span>
        <label class="schema-col3" title="Source site">Location:</label>
          <span class="schema-col4">{{urls[source]}}</span>
        <label class="schema-col1" title="Folder from which to load schema">Store:</label>
        <select class="schema-col2" v-model="storeName" @change.stop="chgSpec()">
          <option v-for="s of Object.keys(site.stores.schema)" :value="s">{{s}}</option>
        </select>
        <label class="schema-col3" title="Selected Schema">Schema:</label>
        <select class="schema-col4" v-model="schemaSpec" @change.stop="chgSpec(schemaSpec)">
          <option v-for="s of site.stores.schema[storeName]||[]" :value="s">{{s.name}}</option>
        </select>
        <label class="schema-col1" title="Schema specification">Spec:</label>
        <label class="schema-col2" title="Schema name">{{spec.name}}</label>
        <label class="schema-col3" title="Schema size">{{spec.size}}</label>
        <span class="schema-col4">
          <label title="Schema date/time">{{spec.time}}</label>
          <i v-show="spec.name" class="text-middle" v-icon:cloud_download title="Load Schema" @click.stop="load"></i>
        </span>
      </div>

      <!-- schema publishing view -->
      <div class="schema-grid" v-if="view=='publish'">
        <span class="schema-hdr">Publish Schema...</span>
        <label class="schema-col1" title="Destination for storing schema">to:</label>
          <span class="schema-col2">
            <input type='radio' name="dest" value="preview" v-model="dest" :disabled="!urls.preview" /><span v-if-class:text-disabled="!urls.preview">Preview</span>
            <input type='radio' name="dest" value="live" v-model="dest" />Live
          </span>
        <label class="schema-col3" title="Destination site">Location:</label>
          <span class="schema-col4">{{urls[dest]}}</span>
        <label class="schema-col1" title="Publish URL">URL:</label>
          <label class="schema-col2-4" title="">{{toURL(null,'schema',model.files.store,'schema')}}<br>{{toURL(null,'data',model.files.store,'data')}}</label>
        <label class="schema-col1" title="History Notation">Comment:</label>
          <input ref="cmnt" type="text" class="schema-col2-4 stretch" v-model="comment" required />
          <span class="schema-col2-4 text-small">Brief description of changes for history. [REQUIRED to live publish!]</span>
        <label class="schema-col1" title="Version Control identifier">Version:</label>
          <label class="schema-col2" title="File version"><span class="text-bold">{{version}}</span> (<=={{model.version}})</label>
        <label class="schema-col3" title="Username of publishing author">Author:</label>
          <label class="schema-col4 text-bold" title="">{{who}}</label>
        <button class="schema-col1 justify-center cms-button" :disabled="dest=='live'&&!comment" @click.stop="publish">
          <i class="text-middle" v-icon:cloud_upload title="Publish Schema"></i> PUBLISH</button>
          <label class="schema-col2" title="Backup flag">
            <span v-if-class:text-bold="backup">BACKUP {{backup ? 'ENABLED':'DISABLED'}}</span></label>
          <label v-show="msg" class="schema-col2-4 text-alert text-pre" >{{msg}}</label>
      </div>

      <!-- resource upload view -->
      <div class="schema-grid" v-if="view=='upload'">
        <span class="schema-hdr">Upload resources...</span>
        <button class="schema-col1 cms-button" @click.stop="$refs['file'].click();">Browse...</button>
          <label class="schema-col2-4" title="Resource info..."><input v-show="false" ref="file" type="file" @change="chgRsrc" />
            {{ resource.file.name||'undefined' }} [{{resource.file.size}}] ({{resource.file.dtd}})
            <i v-show="resource.isImg" v-icon:image @click.stop.prevent="preview"></i></label>
          <span v-if="resource.msg" class="schema-col2-4 text-alert">{{resource.msg}}</span>  
          <img class="schema-col2-4 cms-preview" v-show="resource.isImg&&resource.preview" ref="preview" src="" />
        <label class="schema-col1" title="Folder from which to load schema">Save To:</label>
          <select class="schema-col2" v-model="resource.saveTo" required @change="chgRsrc">
            <option v-for="s of Object.keys(site.stores.$resources)" :value="s">[{{s}}]</option>
          </select>
            <label class="schema-col3" title="SaveAs filename">Save As:</label>
              <input class="schema-col4" type="text" v-model="resource.saveAs" required @input="chgRsrc" />
        <label class="schema-col1" title="Image 'alt' property text">Annotation:</label>
          <input class="schema-col2" type="text" v-model="resource.annotation" @input="chgRsrc" />
        <label class="schema-col1" title="Resource URL">URL:</label>
          <label class="schema-col2-4" v-if-class:text-alert="resource.exists">{{toURL('live',resource.saveTo,resource.store,resource.saveAs)}}
          <label v-show="resource.exists"><input type="checkbox" v-model="resource.force" @change="chgRsrc"/>(Exists) Force Replace</label></label>
        <label class="schema-col1" title="Schema specification">Links:</label>
          <span v-show="clipboard" class="schema-col2-4">
            <label title="Raw reference">RAW: {{resource.raw}}<i v-icon:content_copy @click.stop="clpRsrc('raw')"></i></label><br>
            <label title="Markdown reference">Markdown (MD): {{resource.md}}<i v-icon:content_copy @click.stop="clpRsrc('md')"></i></label><br>
            <label title="HTML reference">HTML: {{resource.html}}<i v-icon:content_copy @click.stop="clpRsrc('html')"></i></label>
          </span>
        <button class="schema-col1 cms-button" :disabled="!resource.ok" 
          @click.stop="upload">Upload <i class="text-middle" v-icon:cloud_upload></i></button>
      </div>
      
      <cms-x v-if="view=='data'" hdr="Schema...">
        <span class="xschema">{{JSON.stringify(model,null,2)}}</span>
      </cms-x>

      <cms-x v-if="view=='data'" hdr="Extracted Data...">
        <span class="xdata">{{JSON.stringify(xdata,null,2)}}</span>
      </cms-x>
      
      <cms-x v-if="view=='define'" class="cms-history" hdr="History...">
        <span class="cms-history-grid text-small" v-for="h in info.history.slice().reverse()">
          <span class="cms-history-dtd">{{ h.dtd }}</span>
          <span class="cms-history-version">{{ h.version||'' }}</span>
          <span class="cms-history-author">{{ h.author }}</span>
          <span class="cms-history-note">{{ h.note }}</span>
        </span>
      </cms-x>

      <cms-notes :notes=info.notes :view="view=='define'?'edit':'list'" @chg="chgNotes"></cms-notes>

    </template>
    </div>`,
    watch: {
      'info': function() { this.model = jsonCopy(this.info); this.serial = !!this.model.series; this.xdata = this.cms.extractData(this.model); },
      'view': function() { this.$emit('act','clrMsg'); }
    }
});

// root element for building schema tree...
Vue.component('cms-root',{
  computed: {
    cms() { return this; },
    expandIcon() { return this.expanded?'expand_less':'expand_more' },
    container() { return (this.schema.container=='unordered' ? 'Unordered Object' : 'Ordered Array') + ` (${this.schema.key})` },
    lineage() { return [{schema:this.schema,index:null}]; },
    pretty() {return (this.site.cfg.publish||{}).pretty ? 2 : undefined; },
  },
  created: function() { this.listFolders(()=>{ this.expanded = true; }); },
  data: function() { 
    return {
      actionMsg: '',
      bar: 'schema',
      expanded: false,
      developer: false, // false equates to author
      originalSchema: jsonCopy(schemaDefinitions.schema),
      schema: jsonCopy(schemaDefinitions.schema),
      serial: false,
      site: {
        cfg: this.cfg||{},
        directory: {},
        source: 'live',
        stores: {},
        unsaved: false
      },
      view: 'load'
    }
  },
  props: ['cfg', 'creds'],
  methods: {
    act: function(action,data) {
      ///console.log('act:',action,data);
      switch (action) {
        case 'load': this.loadSchema(data); break;
        case 'publish': this.publish(data); break;
        case 'upload': this.upload(data); break;
        case 'clrMsg': this.actionMsg = ''; break;
      };
    },
    addElement: function(type,siblings) {
      let tmp = jsonCopy(schemaDefinitions.elements.$root).mergekeys(jsonCopy(schemaDefinitions.elements[type]));
      tmp.mergekeys({key: uniqueID()}).mergekeys({name: this.uniqueName(siblings.map(s=>s.name),tmp.name)});
      this.$set(siblings,siblings.length,tmp);
      return tmp;
    },
    chgChild: function(evt,index,schema) { this.$set(this.schema.children,index,schema); this.chgSchema(this.schema); },
    chgLocus: function(action,evt,index,elx,container) {
      let cc = container ? container.children : this.schema.children;
      switch (action) {
        case 'add': console.error("root chgLocus 'add' can't occur"); break;
        case 'delete': evt.ctrlKey ? this.$delete(cc,index) : alert("Use CTRL+click to delete!"); break;
        case 'copy': elx.name=this.uniqueName(cc.map(c=>c.name),elx.name); cc.splice(index+1,0,elx); break;
        case 'up': if (index>0) { this.$set(cc,index,cc[index-1]); this.$set(cc,index-1,elx); }; break;
        case 'down': if (index<(cc.length-1)) { this.$set(cc,index,cc[index+1]); this.$set(cc,index+1,elx); }; break;
        case 'place': elx.name=this.uniqueName(cc.map(c=>c.name),elx.name); cc.splice(index+1,0,elx); break; // elx holds grandchild being promoted
        case 'demote': if ((index>0)&&(cc[index-1].element=='container')) {
          elx.name=this.uniqueName(cc[index-1].children.map(c=>c.name),elx.name); 
          this.$set(cc[index-1].children,cc[index-1].children.length,elx);
          this.$delete(cc,index);
        }; break;
      };
      if (!container) { this.chgSchema(); };
    },
    chgMode: function() { this.developer = !this.developer; },
    chgSchema: function(schema,site) { this.schema=jsonCopy(schema||this.schema); this.serial=!!this.schema.series; this.chgSite(site); },
    chgSeries: function(s) {
      this.schema.series = jsonCopy(s);
      let x = scanForMatchTo(this.schema.children,{name: this.schema.series.meta.element},{});
      x.data = jsonCopy(s.data[this.schema.series.meta.element]);
      this.chgSchema();
    },
    chgSite: function(s={}) { s.mergekeys({unsaved:true}); s.mapByKey((v,k)=>this.$set(this.site,k,v)); if ('source' in s) this.listFolders(); },
    edit: function(view) { let same=this.view==view; this.view=(this.expanded&&same)?'data':view; this.expanded=same?!this.expanded:true; },
    expand: function() { this.expanded = !this.expanded; },
    extractData: function(child,raw=false) {  // returns current schema data
      if (child===undefined) return null;
      if (child.container) {
        let tmp = (child.container=='ordered') ? [] : {};
        for (let i in child.children) {
          let index = (child.container=='ordered') ? i : child.children[i].name;
          tmp[index] = this.extractData(child.children[i],raw);
        };
        return tmp;
      } else {
        return !raw&&child.auto ? md2html(child.data,!child.block&&child.strip) : child.data;  // presently only supports MD->HTML
      };
    },
    listFolders: function(cb) {
      var flatten = (dir) => {
        let flat = [];
        dir.map(fso=>fso.type=='file' ? flat.push(fso) : flatten(fso.listing).forEach(f=>flat.push(f)));
        return flat;
      };
      let s = this.cfg.urls[this.site.source];
      let fx = Object.keys(this.cfg.folders);
      let opts = {headers: {authorization: this.creds.auth}};
      Promise.all(fx.map(async (f,k)=>await this.fetchJSON('GET',s+this.cfg.folders[f],opts)))
        .then(x=>{
          x.map((r,i)=>{
          if (!r.ok) throw r.error;
          this.site.directory[fx[i]] = (r.jxOK && !r.jx.error) ? r.jx : null;
          });
          this.site.stores = this.site.directory.filterByKey(f=>f!==null).mapByKey(d=>flatten(d));
          this.$set(this.site.stores,'$resources',this.site.stores.filterByKey((s,k)=>!['data','schema'].includes(k)));
        })
       .catch(e=>console.error("listFolders:",e));
    },
    loadSchema: function(def) { // def: src, store, spec: name,...
      let url = makePath(this.cfg.urls[def.src],def.store.replace('[schema]',this.cfg.folders.schema),def.spec.name);
      this.fetchJSON('GET',url)
        .then(res=>{
          if (res.jxOK) {
            console.log("loadSchema:",url);
            let schema = jsonCopy(schemaDefinitions.schema).mergekeys(res.jx);  // patch to add new definitions to old schema
            this.chgSchema(this.uniquifySchema(schema));  // patch to fix old schema that sometimes have duplicate sibling names
            this.originalSchema = jsonCopy(this.schema);
            this.edit('data');
            this.site.unsaved = false;
            this.expanded = !this.expanded;
            return res;
          } else {
            console.warn("loadSchema:",res);
          }; })
        .catch(e=>{ console.error("loadSchema:",e); });
    },
    newSchema: function() { return jsonCopy(schemaDefinitions.schema); },
    pick: function(bar,pk,evt) { 
      switch (bar) {
        case 'add': if (pk!='close') { this.addElement(pk,this.schema.children); this.chgSchema(); }; this.bar = 'schema'; break;
        case 'schema': if (pk=='add') { this.bar='add'; }; break;
        case 'info': this.view = pk; break;
      };
    },
    publish: function(args) {
      let buildKWList = (lst,kws,i) => { (kws||'').split(',').map(kw=>kw.trim()).filter(w=>w).forEach(kw=>(kw in lst)?lst[kw].push(i):lst[kw]=[i]); return lst; };
      let files=[]; // build file records, 
      if (this.schema.series) this.schema.series.data = null; // cleanup temporary series data
      let workingSchema = jsonCopy(this.schema);  // make a copy of schema to work with...
      let workingVersion = workingSchema.version;
      let workingSeries = jsonCopy(this.schema.series); // null if not series
      let workingData = this.extractData(workingSchema);
      let workingDataRaw = this.extractData(workingSchema,true);
      if (workingSeries) { // adjustments for series
        workingSeries.meta.dtd = new Date().style('iso');
        // construct series instance data file name: pattern --> $p<digits>:post, $u:user, $v:version, $$:$
        let spec = workingSeries.filespec;
        let postMatch = spec.match(/\$p(\d)?/);
        if (postMatch) spec = spec.replace(postMatch[0],('00000000'+(1+(workingSeries.active||workingSeries.index.length))).substr(-(postMatch[1]||4)));
        spec = spec.replace('$v',args.history.version).replace('$u',args.history.author).replace('$$','$');
        workingSeries.meta.file = makePath(workingSchema.files.store,spec);
        // build specific posting data file and add to files ...
        files.push({ name: workingSeries.meta.file, folder: 'data', backup: false, format: 'JSON', 
          contents: JSON.stringify({ $meta: workingSeries.meta, $data: workingData },null,this.pretty) });
        // construct schema file contents (workingSchema) based on new posting or edit of prior (before last) post ...
        let priorPost = (workingSeries.active!==null && workingSeries.active!==workingSeries.index.length-1);
        if (priorPost) workingSchema = jsonCopy(this.originalSchema); // restore schema (element) and index if not last post
        if (workingSeries.active!==null) {
          workingSeries.index[workingSeries.active] = { $meta: workingSeries.meta, $data: workingDataRaw };
        } else {
          workingSeries.index.push({ $meta: workingSeries.meta, $data: workingDataRaw }); //push new post to schema
        };
        workingSchema.series = jsonCopy(workingSeries);
        // construct series data file ...
        let seriesData = jsonCopy(priorPost ? this.extractData(this.originalSchema) : workingData);
        // build the series index and keywords table data ...
        let indexData = {$index: [], $keywords: {}};
        workingSeries.index.forEach((p,i)=>{ indexData.$index.push({$meta:p.$meta, $data:null}); buildKWList(indexData.$keywords,p.$meta.keywords,i); }) 
        indexData.$index[indexData.$index.length-1].$data = jsonCopy(seriesData); // data always included for last record
        workingData = seriesData.mergekeys(indexData);
      };
      if (args.dest=='live') { // include history for live destination
        workingSchema.version = args.history.version;
        workingSchema.history.push(args.history);
      };
      // queue files list...
      let specSchema = makePath(workingSchema.files.store,workingSchema.files.schema);
      files.push({ name: specSchema, folder: 'schema', format: 'JSON', contents: JSON.stringify(workingSchema,null,this.pretty),
        backup: (args.backup) ? specSchema.replace('.json','.'+workingVersion+'.bak') : '' });
      let specData = makePath(workingSchema.files.store,workingSchema.files.data);
      files.push({ name: specData, folder: 'data', format: 'JSON', contents: JSON.stringify(workingData,null,this.pretty),
        backup: (args.backup) ? specData.replace('.json','.'+workingVersion+'.bak') : '' });
      // publish files to selected sites, always at least preview...
      let sites = distinct(['preview',args.dest]).map(x=>({dest:x,url:this.site.cfg.urls[x]})).filter(u=>u.url);
      sites.forEach(ux=>{
        let url = makePath(ux.url,this.site.cfg.urls['publish']);
        this.fetchJSON('POST',url,{body: files, headers:{authorization: this.creds.auth}})
          .then(res=>{
            if (!res.jxOK || res.jxError) throw [ux,res];
            console.log('jx:',res.jx);
            res.jx.data.map((r,j)=>files[j].mergekeys({status:r?'successful':'failed'}))
              .forEach(f=>console.log(`Publishing ${ux.dest} ${f.folder} ${f.name} ${f.status}`));
            let ok = res.jx.data.every(t=>t);
          if (ux.dest=='live') {
            this.actionMsg += this.actionMsg ? '\n' : '';
            this.actionMsg += `Publishing to ${ux.dest} (${ux.url}) ${ok?'successful':'failed'}...`;
            this.schema = jsonCopy(workingSchema);  // update schema from copy
            this.site.unsaved = false;
            this.listFolders();
          }; })
          .catch(e=>{
            console.log('Publishing failure:',e);
            this.actionMsg += this.actionMsg ? '\n' : '';
            this.actionMsg +=  `Publishing failure at ${url} - see console (CTRL+SHFT+J).`;
          });
      });
    },
    uniqueName: function(list,name) { let n=1; let nx=name; while(list.includes(nx)) nx=name+n++; return nx; },
    uniquifySchema: function(s) {
      s.children.forEach((c,i)=>{ 
        s.children[i].name = this.uniqueName(s.children.map(ch=>ch.name).filter((x,ix)=>ix!=i),c.name); 
        if (c.element=='container') this.uniquifySchema(c);
      });
      return s;
    },
    upload: function(resource) {
      var file = { name: resource.spec, folder:resource.folder, format: resource.format, contents: resource.contents, append: !!resource.flag };
      ['live','preview'].map(x=>this.site.cfg.urls[x]).filter(u=>u).forEach(ux=>{
        let url = makePath(ux,this.site.cfg.urls['upload']);
        this.fetchJSON('POST',url,{body: [file], headers:{authorization: this.creds.auth}})
          .then(res=>{
            if (res.jxOK&&!res.jx.error) {
              console.log(`Sucessfully uploaded ${resource.raw} to ${url}`);
              this.listFolders();
            } else {
              console.warn(`Failed to upload ${resource.raw} to ${url}!`);
            }; })
          .catch(e=>console.error("upload:",e));
      });
    }
  },
  template: `
    <div class="cms">
      <!-- header always shown --> 
      <div class="schema-header" @click.stop="expand">
        <span class="schema-header-xicon"><i v-icon:[expandIcon]></i></span>
        <span class="schema-header-id" v-if-class:text-italic="site.unsaved"><em>{{schema.label}}</em> [{{schema.files.schema}}]{{site.unsaved?'*':''}} {{developer}}</span>
        <span class="schema-header-nav">
          <i v-icon="developer?'D':'A'" class="cms-icon-letter" @click.stop="chgMode"></i>
          <cms-icon-bar v-if="developer" :bar="bar" @pick="pick"></cms-icon-bar>
        </span>
      </div>
      <div v-show="expanded" class="schema-header-subsection">
        <span class="schema-header-id schema-header-desc">{{schema.description}}</span>
        <span class="schema-header-nav">
          <cms-icon-bar bar="info" :filter="!developer?'developer':''" @pick="pick"></cms-icon-bar>
          <!--<i v-if="developer" v-icon:build title="Define Schema" @click.stop="edit('schema')"></i>
          <i v-icon:cloud title="Load or Publish Schema" @click.stop="edit('cloud')"></i>-->
        </span>
      </div>
      
      <div v-if="view=='data'&&expanded">
        <cms-element v-for="c,i in schema.children" :key="c.name" :cms="cms" :developer="developer" :element="c" :index="i" :lineage="lineage" :raw="true"
          @chg="chgChild"></cms-element>
      </div>
      <cms-info :cms="cms" :expanded="expanded" :info="schema" :msg="actionMsg" :site="site" :view="view" :who="creds.who" @chg="chgSchema" @act="act"></cms-info>
      <cms-series v-if="serial" :info="schema.series" :notes="schema.notes" :site="site" @chg="chgSeries"></cms-series>
      <cms-element v-for="child,i of schema.children" :key="child.key" 
        :cms="cms" :developer="developer" :element="child" :index="i" :lineage="lineage" @chg="chgChild" @locus="chgLocus"></cms-element>
    </div>`
});
