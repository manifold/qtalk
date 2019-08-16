import * as qmux from "./qmux";
import * as WebSocket from "ws";
import * as net from "net";

export var Session = qmux.Session;
export var Channel = qmux.Channel;

interface IListener {
    accept(): Promise<qmux.Session>;
    close(): Promise<void>;
}

interface IConn {
	read(len: number): Promise<Buffer>;
	write(buffer: Buffer): Promise<number>;
	close(): Promise<void>;
}

class queue {
	q: Array<any>
	waiters: Array<Function>
	closed: boolean

	constructor() {
		this.q = [];
		this.waiters = [];
		this.closed = false;
	}

	push(obj: any) {
		if (this.closed) throw "closed queue";
		if (this.waiters.length > 0) {
			this.waiters.shift()(obj);
			return;
		}
		this.q.push(obj);
	}

	shift(): Promise<any> {
		if (this.closed) return;
        return new Promise(resolve => {
            if (this.q.length > 0) {
                resolve(this.q.shift());
                return;
            }
            this.waiters.push(resolve);
        })
	}
	
	close() {
		if (this.closed) return;
		this.closed = true;
		this.waiters.forEach(waiter => {
			waiter(undefined);
		});
	}
}

export function DialTCP(port: number, host?: string): Promise<IConn> {
    return new Promise(resolve => {
        var socket = net.createConnection(port, host, () => {
            resolve(new TCPConn(socket));
        });
    })
}

export async function ListenTCP(port: number, host?: string): Promise<IListener> {
    var listener = new TCPListener();
    await listener.listen(port, host);
    return listener;
}

export class TCPListener implements IListener {
    server: net.Server
    pending: queue

	constructor() {
        this.pending = new queue();
    }
    
    listen(port: number, host?: string): Promise<void> {
        return new Promise(resolve => {
            this.server = net.createServer((c) => {
                this.pending.push(new qmux.Session(new TCPConn(c)));
            });
            this.server.on('error', (err) => {
                throw err;
            });
            this.server.on("close", () => {
                this.pending.close();
            });
            this.server.listen(port, host, resolve);
        });
    }

    accept(): Promise<qmux.Session> {
        return this.pending.shift();
    }
    
    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((err: Error) => {
                if (err !== undefined) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

export class TCPConn implements IConn {
    socket: net.Socket
    error: any

    constructor(socket: net.Socket) {
        this.socket = socket;
        this.socket.on('error', (err) => this.error = err);
    }
 
    read(len: number): Promise<Buffer> {
        const stream = this.socket;

        return new Promise((resolve, reject) => {
            if (this.error) {
                const err = this.error
                delete this.error
                return reject(err)
            }

            if (!stream.readable || stream.destroyed) {
                return resolve()
            }

            const readableHandler = () => {
                let chunk = stream.read(len);

                if (chunk != null) {
                    removeListeners();
                    resolve(chunk);
                }
            }

            const closeHandler = () => {
                removeListeners();
                resolve();
            }

            const endHandler = () => {
                removeListeners();
                resolve();
            }

            const errorHandler = (err) => {
                delete this.error;
                removeListeners();
                reject(err);
            }

            const removeListeners = () => {
                stream.removeListener('close', closeHandler);
                stream.removeListener('error', errorHandler);
                stream.removeListener('end', endHandler);
                stream.removeListener('readable', readableHandler);
            }

            stream.on('close', closeHandler);
            stream.on('end', endHandler);
            stream.on('error', errorHandler);
            stream.on('readable', readableHandler);

            readableHandler();
        });
    }

	write(buffer: Buffer): Promise<number> {
        return new Promise(resolve => {
            this.socket.write(buffer, () => resolve(buffer.byteLength));
        });
    }

	close(): Promise<void> {
        return new Promise(resolve => {
            this.socket.destroy();
            resolve();
        });
    }
}



export function DialWebsocket(addr: string): Promise<IConn> {
    return new Promise((resolve, reject) => {
        var socket = new WebSocket(addr, {
            perMessageDeflate: false,
            origin: 'https://'+addr
        });
        socket.on("open", () => {
            resolve(new WebsocketConn(socket));
        });
        socket.on("error", (err) => {
            reject(err);
        });
    })
}

export async function ListenWebsocket(port: number, host?: string): Promise<IListener> {
    var listener = new WebsocketListener();
    await listener.listen(port, host);
    return listener;
}

export class WebsocketListener implements IListener {
    server: WebSocket.Server
    pending: queue

	constructor() {
        this.pending = new queue();
    }
    
    listen(port: number, host?: string): Promise<void> {
        return new Promise(resolve => {
            this.server = new WebSocket.Server({
                host: host,
                port: port,
                perMessageDeflate: false,
            }, resolve);
            this.server.on("connection", (c) => {
                this.pending.push(new qmux.Session(new WebsocketConn(c)));
            });
            this.server.on("error", (err) => {
                throw err;
            });
            this.server.on("close", () => {
                this.pending.close();
            });
        });
    }

    accept(): Promise<qmux.Session> {
        return this.pending.shift();
    }
    
    close(): Promise<void> {
        return new Promise(resolve => {
            this.server.close(() => resolve());
        });
    }
}

export class WebsocketConn implements IConn {
    socket: WebSocket
    error: any
    waiters: Array<Function>
    buf: Buffer
    isClosed: boolean

    constructor(socket: WebSocket) {
        this.isClosed = false;
        this.buf = Buffer.alloc(0);
        this.waiters = [];
        this.socket = socket;
        this.socket.on("message", data => {
            var buf = data as Buffer;
            this.buf = Buffer.concat([this.buf, buf], this.buf.length+buf.length);
            if (this.waiters.length > 0) {
                this.waiters.shift()();
            }
        });
        this.socket.on("close", () => {
            this.close();
        });
        this.socket.on("error", (err) => {
            console.log("err", err)
        })
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
        return new Promise((resolve, reject) => {
            this.socket.send(buffer, {binary: true}, () => {
                resolve(buffer.length)
            });
        });
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