import * as internal from "./internal.ts";

function sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
}

function loopYield(name: string): Promise<void> {
    //console.log(name);
    //return sleep(10);
    return Promise.resolve();
}

export interface Codec {
    encode(v: any): Uint8Array
    decode(buf: Uint8Array): any
}

export class JSONCodec {
    enc: TextEncoder;
    dec: TextDecoder;
    debug: boolean;

    constructor(debug: boolean = false) {
        this.enc = new TextEncoder();
        this.dec = new TextDecoder("utf-8");
        this.debug = debug;
    }

    encode(v: any): Uint8Array {
        if (this.debug) {
            console.log("<<", v);
        }
        return this.enc.encode(JSON.stringify(v));
    }

    decode(buf: Uint8Array): any {
        let v = JSON.parse(this.dec.decode(buf));
        if (this.debug) {
            console.log(">>", v);
        }
        return v;
    }
}

// only one codec per channel because of read loop!
export class FrameCodec {
    channel: internal.IChannel;
    codec: Codec;
    buf: Array<any>;
    waiters: Array<any>;
    readLimit: number;
    readCount: number;

    constructor(channel: internal.IChannel, codec: Codec, readLimit: number = -1) {
        this.channel = channel;
        this.codec = codec;
        this.buf = [];
        this.waiters = [];
        this.readLimit = readLimit;
        this.readCount = 0;
        this.readLoop();
    }

    async readLoop() {
        while (true) {
            if (this.readLimit > 0 && this.readCount >= this.readLimit) {
                return;
            }
            try {
                await loopYield("readloop");
                var lenPrefix = await this.channel.read(4);
                if (lenPrefix === undefined) {
                    //console.log("DEBUG: readloop exited on length");
                    return;
                }
                var data = new DataView(lenPrefix.buffer);
                var size = data.getUint32(0);
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
                throw new Error("codec readLoop: " + e);
            }
        }
    }

    async encode(v: any): Promise<void> {
        let buf = this.codec.encode(v);
        let lenPrefix = new DataView(new ArrayBuffer(4));
        lenPrefix.setUint32(0, buf.byteLength);
        await this.channel.write(new Uint8Array(lenPrefix.buffer));
        await this.channel.write(buf);
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
