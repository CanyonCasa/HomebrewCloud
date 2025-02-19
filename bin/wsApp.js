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
    this.tag = config.tag;
    this.cfg = config;
    this.authTopics = this.cfg.topics.filter(t=>t.auth).reduce((x,tpc)=>{x[tpc.name]=tpc; return x},{});
    this.scribble = Scribe(config.tag);
    this.wss = new WebSocket.WebSocketServer({ noServer: true });   // no http server since routed via proxy
    this.clients = new Map();   // set of connected clients

    this.wss.on('connection',(ws, req) => {
        const uuid = uuid4();
        const parameters = parseURL(req.url).query;
        const hb = req.hb;  // recover proxy/site context
        const ref = parameters.id || parameters.name || uuid;
        const topics = asList((parameters.topics||parameters.topic));
        const metadata = { uuid, ref, hb, ...parameters };
        this.clients.set(ws,{ws:ws, ref: ref, metadata:metadata, topics: topics, auth: []});
        this.scribble.trace(`Websocket connection ${ref} established...`)

        ws.on('error',(e)=>{
            let def = this.clients.get(ws);
            this.clients.delete(ws);
            this.scribble.error(`ERROR: Deleted websocket client[${def.ref}]:  ${e.toString()}`);
        });

        ws.on('message', async (msg$) => {  // coming from client to server
            let msgError = (e) => {
                this.scribble.warn(e);
                ws.send(JSON.stringify({error: "invalid message", detail: e.toString()}));
            };
            let msg = {};
            try { msg = JSON.parse(msg$); } catch (e) { msgError(e) };
            if (!(verifyThat(msg,'isTrueObject') && verifyThat(msg.topic,'isDefined') && ('payload' in msg)))
                msgError(`ERROR: '{"topic":"...", "payload": ...}' minimum message expected!`);
            // valid message ...
            this.scribble.extra('msg:', print(msg,80));
            let client = this.clients.get(ws);
            if (msg.topic==='-') {
                // authentication, configuration of publishing/subscribing topics, and announcements...
                let auth = msg.auth||msg.jwt||msg.payload.auth||msg.payload.jwt||null;
                if (auth) {
                    let user = jwt.verify(auth) || {member:''};

                  client.topics = distinct([...asList(msg.payload?.topics),...client.topics]);
                    this.cfg.topics.filter(t=>t.auth && client.topics.includes(t.name) && user.member.includes(t.auth)).
                        forEach(tpc=>client.auth.push(tpc.name));
                    msg.auth = client.auth.length ? client.auth : null;
                    client.ws.send(JSON.stringify(msg));
                };
            } else {
                let authTopic = this.authTopics[msg.topic];
                let authorizedToPublish = !authTopic || !authTopic.authRequired || (authTopic.authRequired && client.auth.includes(authTopic.name));
                if (!authorizedToPublish) {
                    msg.error = `Not Authorized to publish to topic ${msg.topic}`
                    client.ws.send(JSON.stringify(msg));    // reply back to client only!
                } else {
                    this.clients.forEach(c=>{
                        if (c.metadata.uuid===client.metadata.uuid) return;   // don't reply to self!
                        let authorizedToSubscribe = !authTopic || ((authTopic.authRequired || msg.auth) && c.auth.includes(authTopic.name));
                        let inDistribution = !msg.clients || msg.clients.includes(c.ref);
                        if (authorizedToSubscribe && inDistribution) c.ws.send(JSON.stringify(msg));
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