import * as msgpack from "msgpack-lite";

interface Session {
	open(): Promise<Channel>;
	accept(): Promise<Channel>;
    close(): Promise<void>;
}

interface Listener {
    accept(): Promise<Session>;
    close(): Promise<void>;
}

interface Channel {
	read(len: number): Promise<Buffer>;
	write(buffer: Buffer): Promise<number>;
	close(): Promise<void>;
}

interface Codec {
    encode(v: any): Uint8Array
    decode(buf: Uint8Array): any
}

function errable(p: Promise<any>): Promise<any> {
    return p
        .then(ret => [ret, null])
        .catch(err => [null, err]);
}

function sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
}

function loopYield(name: string): Promise<void> {
    //console.log(name);
    //return sleep(10);
    return Promise.resolve();
}

// only one codec per channel because of read loop!
class FrameCodec {
    channel: Channel;
    codec: Codec;
    buf: Array<any>;
    waiters: Array<any>;
    readLimit: number;
    readCount: number;

    constructor(channel: Channel, readLimit: number=-1) {
        this.channel = channel;
        this.codec = msgpack;
        this.buf = [];
        this.waiters = [];
        this.readLimit = readLimit;
        this.readCount = 0;
        this.readLoop();
    }

    async readLoop() {
        while(true) {
            if (this.readLimit > 0 && this.readCount >= this.readLimit) {
                return;
            }
            try {
                await loopYield("readloop");
                var sbuf = await this.channel.read(4);
                if (sbuf === undefined) {
                    //console.log("DEBUG: readloop exited on length");
                    return;
                }
                var sdata = new DataView(new Uint8Array(sbuf).buffer);
                var size = sdata.getUint32(0);
                var buf = await this.channel.read(size);
                if (buf === undefined) {
                    //console.log("DEBUG: readloop exited on data");
                    return;
                }
                this.readCount++;
                var v = this.codec.decode(buf);
                if (this.waiters.length > 0) {
                    this.waiters.shift()(v);
                    continue;
                }
                this.buf.push(v);
            } catch (e) {
                throw new Error("codec readLoop: "+e);
            }
        }
    }

    async encode(v: any): Promise<void> {
        var buf = this.codec.encode(v);
        var sdata = new DataView(new ArrayBuffer(4));
        sdata.setUint32(0, buf.length);
        await this.channel.write(Buffer.from(sdata.buffer));
        await this.channel.write(buf as Buffer);
        return Promise.resolve();
    }

    decode(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.buf.length > 0) {
                resolve(this.buf.shift());
                return;
            }
            this.waiters.push(resolve);
        })
    }
}

export class API {
    handlers: { [key:string]:Handler; };

    constructor() {
        this.handlers = {};
    }

    handle(path: string, handler: Handler): void {
        this.handlers[path] = handler;
    }

    handleFunc(path: string, handler: (r: Responder, c: Call) => void): void {
        this.handle(path, {
            serveRPC: async (rr: Responder, cc: Call) => {
                await handler(rr, cc);
            }
        })
    }

    handler(path: string): Handler {
        for (var p in this.handlers) {
            if (this.handlers.hasOwnProperty(p)) {
                if (path.startsWith(p)) {
                    return this.handlers[p];
                }
            }
        }
    }

    async serveAPI(session: Session, ch: Channel): Promise<void> {
        var codec = new FrameCodec(ch);
        var cdata = await codec.decode();
        var call = new Call(cdata.Destination);
	    call.parse();
        call.decode = () => codec.decode();
        call.caller = new Client(session);
	    var header = new ResponseHeader();
        var resp = new responder(ch, codec, header);
        var handler = this.handler(call.Destination);
        if (!handler) {
            resp.return(new Error("handler does not exist for this destination: "+call.Destination));
            return;
        }
        await handler.serveRPC(resp, call);
        return Promise.resolve();
    }
}

export interface Responder {
    header: ResponseHeader;
    return(v: any): void;
    hijack(v: any): Promise<Channel>;
}

class responder implements Responder {
    header: ResponseHeader;
    ch: Channel;
    codec: FrameCodec;

    constructor(ch: Channel, codec: FrameCodec, header: ResponseHeader) {
        this.ch = ch;
        this.codec = codec;
        this.header = header;
    }

    async return(v: any): Promise<void> {
        if (v instanceof Error) {
            this.header.Error = v.message;
            v = null;
        }
        await this.codec.encode(this.header);
        await this.codec.encode(v);
        return this.ch.close();
    }

    async hijack(v: any): Promise<Channel> {
        if (v instanceof Error) {
            this.header.Error = v.message;
            v = null;
        }
        this.header.Hijacked = true;
        await this.codec.encode(this.header);
        await this.codec.encode(v);
        return this.ch;
    }
}

class ResponseHeader {
    Error: string;
    Hijacked: boolean;
}

class Response {
    error: string;
    hijacked: boolean;
    reply: any;
    channel: Channel;
}

interface Caller {
    call(method: string, args: any): Promise<Response>;
}

export class Call {
	Destination: string;
	objectPath:  string;
	method:      string;
	caller:      Caller;
    decode:      () => Promise<any>;
    
    constructor(Destination: string) {
        this.Destination = Destination;
    }

    parse() {
        if (this.Destination.length === 0) {
            throw new Error("no destination specified");
        }
        if (this.Destination[0] == "/") {
            this.Destination = this.Destination.substr(1);
        }
        var parts = this.Destination.split("/");
        if (parts.length === 1) {
            this.objectPath = "/";
            this.method = parts[0];
            return;
        }
        this.method = parts.pop();
        this.objectPath = parts.join("/");
    }
}

interface Handler {
	serveRPC(r: Responder, c: Call): void;
}

export class Client implements Caller {
    session: Session;
    api: API;

    constructor(session: Session, api?: API) {
        this.session = session;
        this.api = api;
    }

    async serveAPI(): Promise<void> {
        if (this.api === undefined) {
            this.api = new API();
        }
        while (true) {
            var ch = await this.session.accept();
            if (ch === undefined) {
                return;
            }
            this.api.serveAPI(this.session, ch)
            await loopYield("client channel accept loop");
        }
    }

    close(): Promise<void> {
        return this.session.close();
    }

    async call(path: string, args: any): Promise<Response> {
        try {
            var ch = await this.session.open();
            var codec = new FrameCodec(ch, 2);
            await codec.encode(new Call(path));
            await codec.encode(args);
        
            var header: ResponseHeader = await codec.decode();
            if (header.Error !== undefined && header.Error !== null) {
                await ch.close();
                return Promise.reject(header.Error);
            }
            var resp: Response = new Response();
            resp.error = header.Error;
            resp.hijacked = header.Hijacked;
            resp.channel = ch;
            resp.reply = await codec.decode(); 
            if (resp.hijacked !== true) {
                await ch.close();
            }
            return resp;    
        } catch (e) {
            await ch.close();
            console.error(e);
        }
    }
}

export class Server {
    API: API;
    
    async serveAPI(sess: Session) {
        while (true) {
            var ch = await sess.accept();
            if (ch === undefined) {
                sess.close();
                return;
            }
            this.API.serveAPI(sess, ch);
            await loopYield("server channel accept loop");
        }
    }

    async serve(l: Listener, api?: API) {
        if (api) {
            this.API = api;
        }
        if (!this.API) {
            this.API = new API();
        }
        while (true) {
            var sess = await l.accept();
            if (sess === undefined) {
                return;
            }
            this.serveAPI(sess);
            await loopYield("server connection accept loop");
        }
    }
}

function exportFunc(fn: Function, rcvr: any): Handler {
    return {
        serveRPC: async function(r: Responder, c: Call) {
            var args = await c.decode();
            try {
                r.return((await fn.apply(rcvr, [args])||null));
            } catch (e) {
                switch (typeof e) {
                    case 'string':
                        r.return(new Error(e));
                    case 'undefined':
                        r.return(new Error("unknown error"));
                    case 'object':
                        r.return(new Error(e.message));
                    default:
                        r.return(new Error("unknown error: "+e));
                  }
            }
            
        }
    };
}

export function Export(v: any): Handler {
    if (typeof v === 'function') {
        return exportFunc(v, null);
    }
    if (typeof v != 'object') {
        throw new Error("can only export functions and objects");
    }
    var handlers = {};
    if (v.constructor.name === "Object") {
        for (var key in v) {
            if (v.hasOwnProperty(key) && typeof v[key] === 'function') {
                handlers[key] = exportFunc(v[key], v);
            }
        }
    } else {
        var props = Object.getOwnPropertyNames(Object.getPrototypeOf(v));
        for (var idx in props) {
            var propName = props[idx];
            if (propName != "constructor" && typeof v[propName] === 'function') {
                handlers[propName] = exportFunc(v[propName], v);
            }
        }
    }
    return {
        serveRPC: async function(r: Responder, c: Call) {
            if (!handlers.hasOwnProperty(c.method)) {
                r.return(new Error("method handler does not exist for this destination: "+c.method));
                return;
            }
            await handlers[c.method].serveRPC(r, c);
        }
    };
}

function uuid4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(cc) {
        var rr = Math.random() * 16 | 0; return (cc === 'x' ? rr : (rr & 0x3 | 0x8)).toString(16);
    });
}

export class ObjectManager {
    values: any;
    mountPath: string;

    constructor() {
        this.values = {};
        this.mountPath = "/";
    }

    object(path: string): ManagedObject {
        var id = path.replace(this.mountPath, "");
        if (id[0] === "/") {
            id = id.substr(1);
        }
        var v = this.values[id];
        if (!v) {
            return undefined;
        }
        return new ManagedObject(this, id, v);
    }

    register(v: any): ManagedObject {
        var id = uuid4();
        this.values[id] = v;
        return new ManagedObject(this, id, v);
    }

    async serveRPC(r: Responder, c: Call) {
        var parts = c.objectPath.split("/");
        var id = parts.pop();
        var v = this.values[id];
        if (!v) {
            r.return(new Error("object not registered: "+c.objectPath));
            return;
        }
        if (typeof v.serveRPC === "function") {
            v.serveRPC(r, c)
        } else {
            Export(v).serveRPC(r, c);
        }
        
    }

    mount(api: API, path: string) {
        this.mountPath = path;
        api.handle(path, this);
    }
}

class ManagedObject {
    manager: ObjectManager;
    id: string;
    value: any;

    constructor(manager: ObjectManager, id: string, value: any) {
        this.manager = manager;
        this.id = id;
        this.value = value;
    }

    dispose() {
        delete this.manager.values[this.id];
    }

    path(): string {
        return [this.manager.mountPath, this.id].join("/");
    }

    handle(): any {
        return {"ObjectPath": this.path()};
    }
}