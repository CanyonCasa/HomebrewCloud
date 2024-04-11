/*
    Generic websocket app...
    Acts like MQTT server with authentication as clients can publish and subscribe to allowed topics

    messages take the form of '{"topic":"...", "payload": {...}' formatted as JSON
    messages with a topic of '-' serve as configuration messages with optional payload fields of:
        publish:    <array or comma delimited list of topics> to publish to
        subscribe:  <array or comma delimited list of topics> to subscribe to
        announce:   <array or comma delimited list of topics> to notify publisher(s) of this new connection
        jwt:        JSON web token for authentication if required for publishing or subscribing
        ref:        alternative reference, default is a UUID version 4 string
    responses to configuration messages may include:
        ref:        assigned connection reference
        publisher:  list of topics to which connection is approved to publish
        subscribed: list of topics to which connection is approved to subscribe
    announcement messages (sent only to publishers) have a topic of '+' and include:
        payload
          topic:    response topic
          clients:  <array or comma delimited list of clients> to reply to
    published messages include:
        topic:      published topic
        payload:    published payload
        clients:    optional <array or comma delimited list of client references> to recieve message
                    otherwise broadcast to all subscribed clients
    responses to published messages include:
        topic:      published topic
        payload:    published payload
        source:     publishing source reference, useful for sessions involving multiple publishers
*/

const WebSocket = require('ws');
const { asList, parseURL, print, verifyThat } = require('./helpers');
const { jwt, Scribe } = require('./workers');            // higher level service workers
const { authorize } = require('./authware');

let uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, 
      (c) =>{let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
  
function wsApp(config) {
    this.appName = 'wsApp';
    this.tag = config.tag;
    this.cfg = config;
    this.scribble = Scribe(config.tag);
    this.wss = new WebSocket.WebSocketServer({ noServer: true });   // no http server since routed via proxy
    this.clients = new Map();

    // node-red phantom connections...
    this.huntZombie = (ws) => {
        let client = this.clients.get(ws);
        if (client && !client.init) {
            this.clients.delete(ws);
            this.scribble.trace(`Zombie[${client.ref}] found and destroyed`);
        };
    };

    this.wss.on('connection',(ws, req) => {
        const id = uuid();
        const parameters = parseURL(req.url).query;
        const hb = req.hb;  // recover proxy/site context
        const ref = parameters.name || id;
        const metadata = { id, ref, hb, ...parameters };
        this.clients.set(ws,{ws:ws, ref: ref, metadata:metadata, publish: [], subscribe: [], init: false});
        setTimeout(()=>{ this.huntZombie(ws) },5000);   // destroy connection if not initialized in 5 seconds...
        this.scribble.trace(`Websocket connection ${ref} established...`)

        ws.on('error',(e)=>{
            let meta = this.clients.get(ws);
            this.clients.delete(ws);
            this.scribble.error(`Websocket client${meta.ref}: ${e.toString()}`);
            this.scribble.trace(`Deleted client: ${meta.ref}`);
        });

        ws.on('message', async (msg$)=>{
            let msgError = (e) => {
                this.scribble.warn(e);
                ws.send(JSON.stringify({error: "invalid message", detail: e.toString()}));
            };
            let msg = {};
            try { msg = JSON.parse(msg$); } catch (e) { msgError(e) };
            this.scribble.extra('msg:', print(msg,80));
            if (verifyThat(msg,'isTrueObject') && verifyThat(msg.topic,'isDefined') && verifyThat(msg.payload,'isAnyObject')) {
                let client = this.clients.get(ws);
                if (msg.topic==='-') {
                    // authentication, configuration of publishing/subscribing topics, and announcements...
                    let user = jwt.verify(msg.jwt||msg.payload.jwt) || {member:''};
                    let [ ptopics, stopics ] = [asList(msg.payload.publish),asList(msg.payload.subscribe)];
                    client.publish = this.cfg.topics.filter(tpc=>ptopics.includes(tpc.name)&&authorize(tpc.publish,user.member))
                        .map(tpc=>tpc.name);
                    client.subscribe = this.cfg.topics.filter(tpc=>stopics.includes(tpc.name)&&authorize(tpc.subscribe,user.member))
                        .map(tpc=>tpc.name);
                    let ref = msg.ref || msg.payload.ref;
                    if (ref) {
                        this.scribble.debug(`Client[${client.ref}] reassigned reference ${ref}`);
                        client.ref = ref;
                    }
                    client.ws.send(JSON.stringify({topic: '-', payload: { ref: client.ref, 
                       publisher: client.publish.join(','), subscribed: client.subscribe.join(',')}}));
                    client.init = true;
                    this.clients.set(ws,client);
                    this.scribble.log(`Client[${client.ref}] initialized as pub:[${client.publish}], sub:[${client.subscribe}]`);
                    if (!msg.payload.announce) return;
                    // client requests immediate subscription to specific subscribed topics...
                    asList(msg.payload.announce).forEach(a=>{
                        this.clients.forEach(c=>{
                            if (!c.publish.includes(a)) return;
                            this.scribble.trace(`Announcing new client[${client.ref}] to publisher[${c.ref}]`);
                            if (c.ws.readyState === WebSocket.OPEN) {
                                let packet = JSON.stringify({topic: '+', payload: {topic: a, clients: client.ref}});
                                c.ws.send(packet);
                            } else {
                                this.scribble.extra(`ws[${c.ref}]: NOT READY`);
                            };
                        });
                    });
                } else {
                    if (!client.publish.includes(msg.topic)) 
                        return this.scribble.warn(`Unautherized attempt to publish to [${client.ref}]`);
                    this.scribble.extra(`Client[${client.ref}]: publishing to topic ${msg.topic}`);
                    // broadcast to all subscribers or to limited client list...
                    let clientList = msg.clients ? asList(msg.clients) : null;
                    this.clients.forEach(c=>{
                        let subscribed = c.subscribe.includes(msg.topic);
                        this.scribble.extra(`Client[${c.ref}]: subscribed to ${msg.topic} => ${subscribed}`);
                        if (!subscribed || (clientList&&!clientList.includes(c.ref))) return;
                        if (c.ws.readyState === WebSocket.OPEN) {
                            let packet = JSON.stringify({topic: msg.topic, payload: msg.payload, source: client.ref});
                            c.ws.send(packet);
                            this.scribble.extra(`ws[${c.ref}]: ${print(packet,80)}`);
                        } else {
                            this.scribble.extra(`ws[${c.ref}]: NOT READY`);
                        };
                    });
            };
            } else {
                msgError(`'{"topic":"...", "payload": {...}' message expected`)
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