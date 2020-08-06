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

// only one codec per channel because of read loop!
export class FrameCodec {
    channel: internal.IChannel;
    codec: internal.Codec;
    buf: Array<any>;
    waiters: Array<any>;
    readLimit: number;
    readCount: number;

    constructor(channel: internal.IChannel, readLimit: number = -1) {
        this.channel = channel;
        this.codec = msgpack;
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
                throw new Error("codec readLoop: " + e);
            }
        }
    }

    async encode(v: any): Promise<void> {
        var buf = this.codec.encode(v);
        var sdata = new DataView(new ArrayBuffer(4));
        sdata.setUint32(0, buf.length);
        await this.channel.write(Uint8Array.from(sdata.buffer));
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
