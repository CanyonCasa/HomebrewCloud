/*
    Generic websocket app...
    Acts like MQTT server with authentication per topic per connection, optionally per message.
    NOTE: 'message' events signal data from client to server; 'send' routes data from server to client(s)

    WS Configuration:
        app: Reference to app name
        route: Server side url
        topics: Array of topic objects
            name: Reference used for msg.topic handling
            auth: If defined, reference to user member authorization for subscribing messages when msg.auth:true or authRequired:true 
            authRequired: Specifies that authoriztion is required for publishing or subscribing to a topic

    Messages take the form of JavaScript objects formatted as JSON strings for communications. 
    Messages may include:  
        topic: The required publishing topic, comma separated list or array of topics. 
            A topic of ‘-‘ reserved for server use such as authentication.
        payload: The required contents being published, but may be null.
        auth: A (boolean) flag indicating message to be passed to authorized members only.
        subtopic: Optional topic specifier.
        client: Optional ID of publishing client.
        clients:  Optional array or comma delimited list of clients for reply otherwise broadcast to all subscribed clients.
        other_fields: as required for specific communications

    Connection request…
        wss://<host>:<port></url>?id=<connection ID>&topics=<comma delimited list>

        id: Optional but suggested for the connection. Defaults to a UUID-4.
        topics: A comma delimited list of (open) topics to join. If a topic requires authentication, 
            a separate control message must be sent with a JWT payload to authirize the specific user
*/

const WebSocket = require('ws');
const { asList, distinct, parseURL, print, verifyThat } = require('./helpers');
const { jwt, Scribe } = require('./workers');            // higher level service workers
const { authorize } = require('./authware');

let uuid4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, 
      (c) =>{let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
  
function wsApp(config) {
    this.appName = 'wsApp';
    this.cfg = config;
    this.tag = config.tag;
    this.definedTopics = config.topics.map(c=>({name: c.name, echo: !!c.echo, auth: c.auth||{}})).reduce((x,t)=>{
        x[t.name]={name: t.name, echo: t.echo, auth:['pub','sub','usr']
            .reduce((y,k)=>{y[k]=t.auth[k] ? asList(t.auth[k]):null; return y;},{})}; return x;},{}); // make complete definitions
    this.scribble = Scribe(config.tag);
    this.wss = new WebSocket.WebSocketServer({ noServer: true });   // no http server since routed via proxy
    this.clients = new Map();   // set of connected clients

    this.wss.on('connection',(ws, req) => {
        const uuid = uuid4();
        const parameters = parseURL(req.url).query;
        const hb = req.hb;  // recover proxy/site context
        const ref = parameters.id || parameters.name || uuid;
        const metadata = { uuid, ref, hb, ...parameters };
        let topics = asList((parameters.topics||parameters.topic));
        this.clients.set(ws,{ws:ws, ref: ref, metadata:metadata, topics: topics, user: {member: []} });
        this.scribble.log(`Websocket connection "${ref}" established for topics [${topics}]...`);
        ws.send(JSON.stringify({topic: '-', ref: ref}));

        ws.on('error',(e)=>{
            let def = this.clients.get(ws);
            this.clients.delete(ws);
            this.scribble.error(`ERROR: Deleted websocket client[${def.ref}]:  ${e.toString()}`);
        });

        ws.on('message', async (msg$) => {  // coming from client to server
            let send = (clientx,msg) => { clientx.ws.send(JSON.stringify(msg)); };
            let err = (eclient,msg,e) => {
                this.scribble.warn(e);
                msg = {error: true, message: "invalid message", detail: e.toString()}
                return send(eclient,msg);
            };
            let client = this.clients.get(ws);
            let msg = {};
            try { msg = JSON.parse(msg$); } catch (e) { err(client,msg,e) };
            if (!(verifyThat(msg,'isTrueObject') && verifyThat(msg.topic,'isDefined') && ('payload' in msg)))
                err(client,msg,`ERROR: '{"topic":"...", "payload": ...}' minimum message expected!`);
            // valid message ...
            this.scribble.extra(`msg[${client.ref}]:`, print(msg,80));
            let auth = msg.auth||msg.jwt||msg.payload?.auth||msg.payload?.jwt||null;
            let user = auth ? (jwt.verify(auth) || {member: []}) : client.user;
            if (msg.topic==='-') {
                // authentication, (TBD configuration of publishing/subscribing topics, and announcements)...
                if (user.username) {
                    client.user = { username: user.username, member: user.member };
                    client.topics = distinct([...asList(msg.payload?.topics),...client.topics]);
                    msg.auth = { ref: client.ref, user: client.user, topics: client.topics, clients: [...this.clients.values()].map(c=>c.ref) };
                    send(client,msg);
                    this.scribble.log(`User ${user.username} authorized; topics list: ${client.topics}`);
                } else {
                    msg.auth = null;
                    err(client,msg,'Unauthorized user');
                };
            } else {
                //let authTopic = this.authTopics[msg.topic];
                let pcheck = msg.topic in this.definedTopics ? this.definedTopics[msg.topic].auth.pub : null;
                let authorizedToPublish = !pcheck || client.user.member.some(m=>pcheck.includes(m));
                if (!authorizedToPublish) {
                    err(client,msg,`NOT Authorized to publish to topic ${msg.topic}`); // reply back to client only!
                    this.scribble.trace(`User ${user.username||'???'} attempted unauthorized publishing to topic ${msg.topic}`);
                } else {
                    this.clients.forEach(c=>{
                        let oneself = (c.metadata.uuid===client.metadata.uuid || c.user.username===client.user.username)
                        if (!c.topics.includes(msg.topic)) return; // not subscribed to topic
                        if (oneself && !this.definedTopics.echo) return; // don't reply to oneself unless echo!
                        let scheck = msg.topic in this.definedTopics ? this.definedTopics[msg.topic].auth.sub : null;
                        let authorizedToSubscribe = !scheck || client.user.member.some(m=>scheck.includes(m));
                        let limitedDistribution = [...(msg.clients||[]),...(msg.client?[msg.client]:[])];
                        let inDistribution = limitedDistribution.length===0 || limitedDistribution.includes(c.ref);
                        if (authorizedToSubscribe && inDistribution) {
                            let ucheck = msg.topic in this.definedTopics ? this.definedTopics[msg.topic].auth.usr : null;
                            if (ucheck && ucheck.includes(c.ref)) { 
                                msg.usr = client.user;
                                msg.client = client.ref;    // only return usr (client) authorized messages back to original client.
                            };
                            send(c,msg);
                        };
                    });
                }
            };
        });

        ws.on('close',()=>{
            let c = this.clients.get(ws);
            if (!c) return;
            this.clients.delete(ws);
            this.scribble.trace(`Closed/deleted client[${c.ref}]: ${c.metadata.id}`);
        });

        this.scribble.extra(`Connected client: ${ref}`);
    });

    this.scribble.trace(`Websocket server[${this.tag}] ready...`);
};

module.exports = wsApp;