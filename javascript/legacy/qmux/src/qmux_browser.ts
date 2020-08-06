import * as qmux from "./qmux";

export var Session = qmux.Session;
export var Channel = qmux.Session;
export var Buffer = require("buffer").Buffer;

interface IConn {
	read(len: number): Promise<Buffer>;
	write(buffer: Buffer): Promise<number>;
	close(): Promise<void>;
}

export function DialWebsocket(addr: string): Promise<IConn> {
    return new Promise((resolve, reject) => {
        var socket = new WebSocket(addr);
        socket.onopen = () => {
            resolve(new Conn(socket));
        };
        socket.onerror = (err) => {
            reject(err);
        };
    })
}


export class Conn implements IConn {
    socket: WebSocket
    error: any
    waiters: Array<Function>
    buf: Buffer
    isClosed: boolean

    constructor(socket: WebSocket) {
        this.isClosed = false;
        this.buf = new Buffer(0);
        this.waiters = [];
        this.socket = socket;
        this.socket.binaryType = "arraybuffer";
        this.socket.onmessage = (event) => {
            var buf = Buffer.from(event.data);
            this.buf = Buffer.concat([this.buf, buf], this.buf.length+buf.length);
            if (this.waiters.length > 0) {
                this.waiters.shift()();
            }
        };
        this.socket.onclose = () => {
            this.close();
        };
        this.socket.onerror = (err) => {
            console.log("err", err)
        };
    }
 
    read(len: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            var tryRead = () => {
                if (this.buf === undefined) {
                    resolve(undefined);
                    return;
                }
                if (this.buf.length >= len) {
                    var data = this.buf.slice(0, len);
                    this.buf = this.buf.slice(len);
                    resolve(data);
                    return;
                }
                this.waiters.push(tryRead);
            }
            tryRead();
        })
    }

    write(buffer: Buffer): Promise<number> {
        this.socket.send(buffer.buffer);
        return Promise.resolve(buffer.byteLength);
    }

	close(): Promise<void> {
        if (this.isClosed) return Promise.resolve();
        return new Promise((resolve, reject) => {
            this.isClosed = true;
            this.buf = undefined;
            this.waiters.forEach(waiter => waiter());
            this.socket.close();
            resolve();
        });
    }
}