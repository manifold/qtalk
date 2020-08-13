import * as internal from "./internal.ts";

export class Peer {
    session: internal.ISession;
    caller: internal.Caller;
    responder: internal.RespondMux;

    constructor(session: internal.ISession, codec: internal.Codec) {
        this.session = session;
        this.caller = new internal.caller(session, codec);
        this.responder = new internal.RespondMux(codec);
    }

    async respond() {
        while (true) {
            let ch = await this.session.accept();
            internal.Respond(this.session, ch, this.responder);
        }
    }

    async call(path: string, args: any): Promise<internal.Response> {
        return this.caller.call(path, args);
    }

    bind(path: string, handler: internal.Handler): void {
        this.responder.bind(path, handler);
    }

    bindFunc(path: string, handler: (r: internal.Responder, c: internal.Call) => void): void {
        this.responder.bindFunc(path, handler);
    }

}

export function CallProxy(caller: internal.Caller): any {
    return new Proxy(caller, {
        get: (t,p,r) => {
            let prop = p as string;
            if (prop.startsWith("$")) {
                return async (...args: any[]) => {
                    let params: any = args;
                    if (args.length === 1) {
                        params = args[0];
                    }
                    if (args.length === 0) {
                        params = undefined;
                    }
                    let resp = await caller.call(prop.slice(1), params);
                    if (resp.error) {
                        throw resp.error;
                    }
                    return resp.reply;
                }
            }
            return Reflect.get(t, p, r);
        }
    })
}