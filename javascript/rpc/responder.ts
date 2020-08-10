import * as internal from "./internal.ts";

export interface Handler {
    respondRPC(r: Responder, c: internal.Call): void;
}

export interface Responder {
    header: ResponseHeader;
    return(v: any): void;
    hijack(v: any): Promise<internal.IChannel>;
}

export class ResponseHeader {
    Error: string|undefined;
    Hijacked: boolean;

    constructor() {
        this.Error = undefined;
        this.Hijacked = false;
    }
}

class responder implements Responder {
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

export async function Respond(session: internal.ISession, ch: internal.IChannel, mux: RespondMux): Promise<void> {
    let codec = new internal.FrameCodec(ch, mux.codec);
    let frame = await codec.decode();

    let call = new internal.Call(frame.Destination);
    
    call.decode = () => codec.decode();
    call.caller = new internal.caller(session, mux.codec);
    
    let header = new ResponseHeader();
    let resp = new responder(ch, codec, header);
    
    let handler = mux.handler(call.Destination);
    if (!handler) {
        resp.return(new Error(`handler does not exist for this destination: ${call.Destination}`));
        return;
    }
    
    await handler.respondRPC(resp, call);
    
    return Promise.resolve();
}

export class RespondMux {
    handlers: { [key: string]: Handler; };
    codec: internal.Codec;

    constructor(codec: internal.Codec) {
        this.codec = codec;
        this.handlers = {};
    }

    // TODO: make more like Go's RespondMux#Bind, can take Handler, HandlerFunc, or tries to export
    bind(path: string, handler: Handler): void {
        this.handlers[path] = handler;
    }

    bindFunc(path: string, handler: (r: Responder, c: internal.Call) => void): void {
        this.bind(path, {
            respondRPC: async (rr: Responder, cc: internal.Call) => {
                await handler(rr, cc);
            }
        })
    }

    handler(path: string): Handler|undefined {
        for (var p in this.handlers) {
            if (this.handlers.hasOwnProperty(p)) {
                if (path.startsWith(p)) {
                    return this.handlers[p];
                }
            }
        }
        return undefined;
    }
}


