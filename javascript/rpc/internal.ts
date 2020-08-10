export * from "../mux/api.ts";
export * from "./codec.ts";
export * from "./responder.ts";
export * from "./caller.ts";
export * from "./peer.ts";

export function errable(p: Promise<any>): Promise<any> {
    return p
        .then(ret => [ret, null])
        .catch(err => [null, err]);
}