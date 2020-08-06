import * as internal from "./internal.ts";

export interface Handler {
    respondRPC(r: Responder, c: internal.Call): void;
}

export interface Responder {
    header: ResponseHeader;
    return(v: any): void;
    hijack(v: any): Promise<internal.IChannel>;
}

export class responder implements Responder {
    header: ResponseHeader;
    ch: internal.IChannel;
    codec: internal.FrameCodec;

    constructor(ch: internal.IChannel, codec: internal.FrameCodec, header: ResponseHeader) {
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

    async hijack(v: any): Promise<internal.IChannel> {
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

export class ResponseHeader {
    Error: string;
    Hijacked: boolean;
}

export class Response {
    error: string;
    hijacked: boolean;
    reply: any;
    channel: internal.IChannel;
}

export class RespondMux {
    handlers: { [key: string]: Handler; };

    constructor() {
        this.handlers = {};
    }

    bind(path: string, handler: Handler): void {
        this.handlers[path] = handler;
    }

    bindFunc(path: string, handler: (r: Responder, c: Call) => void): void {
        this.bind(path, {
            respondRPC: async (rr: Responder, cc: Call) => {
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

    async serveAPI(session: ISession, ch: IChannel): Promise<void> {
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
            resp.return(new Error("handler does not exist for this destination: " + call.Destination));
            return;
        }
        await handler.respondRPC(resp, call);
        return Promise.resolve();
    }
}


