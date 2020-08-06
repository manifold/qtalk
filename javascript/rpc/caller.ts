import * as internal from "./internal.ts";

interface Caller {
    call(method: string, args: any): Promise<Response>;
}

export class Call {
    Destination: string;
    objectPath: string;
    method: string;
    caller: Caller|undefined;
    decode: any;

    constructor(Destination: string) {
        this.Destination = Destination;
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


export class Client implements Caller {
    session: internal.ISession;
    api: internal.RespondMux;

    constructor(session: internal.ISession, api?: internal.RespondMux) {
        this.session = session;
        this.api = api;
    }

    async serveAPI(): Promise<void> {
        if (this.api === undefined) {
            this.api = new internal.RespondMux();
        }
        while (true) {
            var ch = await this.session.accept();
            if (ch === undefined) {
                return;
            }
            this.api.serveAPI(this.session, ch)
            //await loopYield("client channel accept loop");
        }
    }

    close(): Promise<void> {
        return this.session.close();
    }

    async call(path: string, args: any): Promise<Response> {
        var resp: Response = new Response();
        try {
            var ch = await this.session.open();
            var codec = new internal.FrameCodec(ch, 2);
            await codec.encode(new Call(path));
            await codec.encode(args);

            var header: internal.ResponseHeader = await codec.decode();
            if (header.Error !== undefined && header.Error !== null) {
                await ch.close();
                return Promise.reject(header.Error);
            }
            resp.error = header.Error;
            resp.hijacked = header.Hijacked;
            resp.channel = ch;
            resp.reply = await codec.decode();
            if (resp.hijacked !== true) {
                await ch.close();
            }
            return resp;
        } catch (e) {
            console.error(e, path, args, resp);
            //await ch.close();
        }
    }
}