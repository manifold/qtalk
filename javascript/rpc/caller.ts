import * as internal from "./internal.ts";

export interface Caller {
    call(method: string, args: any): Promise<internal.Response>;
}

export class Call {
    Destination: string;
    objectPath: string;
    method: string;
    caller: Caller|undefined;
    decode: any;

    constructor(destination: string) {
        this.Destination = destination;
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
        this.method = parts.pop() as string;
        this.objectPath = parts.join("/");
    }

}

export class Response {
    error: string|undefined;
    hijacked: boolean;
    reply: any;
    channel: internal.IChannel;

    constructor(channel: internal.IChannel) {
        this.channel = channel;
        this.error = undefined;
        this.hijacked = false;
    }
}

export class caller implements Caller {
    session: internal.ISession;
    codec: internal.Codec;

    constructor(session: internal.ISession, codec: internal.Codec) {
        this.session = session;
        this.codec = codec;        
    }

    async call(path: string, args: any): Promise<internal.Response> {
        try {
            let ch = await this.session.open();
            let resp: internal.Response = new internal.Response(ch);
            let codec = new internal.FrameCodec(ch, this.codec, 2);
            
            await codec.encode(new Call(path));
            await codec.encode(args);

            let header: internal.ResponseHeader = await codec.decode();
            if (header.Error !== undefined && header.Error !== null) {
                // await ch.close();
                // return Promise.reject(header.Error);
                console.error(header);
            }
            
            resp.error = header.Error;
            resp.hijacked = header.Hijacked;
            resp.reply = await codec.decode();
            if (resp.hijacked !== true) {
                await ch.close();
            }
            
            return resp;
        } catch (e) {
            console.error(e, path, args);
            return Promise.reject("call?");
            //await ch.close();
        }
    }
}