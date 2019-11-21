
// message numbers
const msgChannelOpen = 100;
const msgChannelOpenConfirm = 101;
const msgChannelOpenFailure = 102;
const msgChannelWindowAdjust = 103;
const msgChannelData = 104;
const msgChannelEOF = 105;
const msgChannelClose = 106;

// hardcoded window size constants
const minPacketLength = 9;
const channelMaxPacket = 1 << 15;
const channelWindowSize = 64 * channelMaxPacket;

// message types as objects
interface channelOpenMsg {
	peersID:       number;
	peersWindow:   number;
	maxPacketSize: number;
}

interface channelOpenConfirmMsg {
	peersID:       number;
	myID:          number;
	myWindow:      number;
	maxPacketSize: number;
}

interface channelOpenFailureMsg {
	peersID: number;
}

interface channelWindowAdjustMsg {
	peersID:         number;
	additionalBytes: number;
}

interface channelDataMsg {
	peersID: number;
	length:  number;
	rest:    Uint8Array;
}

interface channelEOFMsg {
	peersID: number;
}

interface channelCloseMsg {
	peersID: number;
}

// queue primitive for incoming connections and
// signaling channel ready state
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

// the libmux API
interface IConn {
	read(len: number): Promise<Buffer>;
	write(buffer: Buffer): Promise<number>;
	close(): Promise<void>;
}

interface ISession {
	open(): Promise<IChannel>;
	accept(): Promise<IChannel>;
    close(): Promise<void>;
    //wait(): Promise<void>;
}

interface IChannel extends IConn {
	ident(): number
}

// session class that manages the "connection"
export class Session implements ISession {
	conn: IConn;
	channels: Array<Channel>;
	incoming: queue;

	constructor(conn: IConn) {
		this.conn = conn;
		this.channels = [];
		this.incoming = new queue();
		this.loop();
	}

	async readPacket(): Promise<Buffer> {
		var sizes = new Map([
			[msgChannelOpen,         12],
			[msgChannelOpenConfirm,  16],
			[msgChannelOpenFailure,  4],
			[msgChannelWindowAdjust, 8],
			[msgChannelData,         8],
			[msgChannelEOF,          4],
			[msgChannelClose,        4],
		]);
		var msg = await this.conn.read(1);
		if (msg === undefined) {
			return;
		}
		if (msg[0] < msgChannelOpen || msg[0] > msgChannelClose) {
			return Promise.reject("bad packet: "+msg[0]);
		}
		var rest = await this.conn.read(sizes.get(msg[0]));
		if (rest === undefined) {
			return Promise.reject("unexpected EOF");
		}
		if (msg[0] === msgChannelData) {
			var view = new DataView(new Uint8Array(rest).buffer);
			var length = view.getUint32(4);
			var data = await this.conn.read(length);
			if (data === undefined) {
				return Promise.reject("unexpected EOF");
			}
			return Buffer.concat([msg, rest, data], length+rest.length+1);
		}
		return Buffer.concat([msg, rest], rest.length+1);
	}

	async handleChannelOpen(packet: Buffer) {
		var msg: channelOpenMsg = decode(packet);
		if (msg.maxPacketSize < minPacketLength || msg.maxPacketSize > 1<<30) {
			await this.conn.write(encode(msgChannelOpenFailure, {
				peersID: msg.peersID
			}));
			return;
		}
		var c = this.newChannel();
		c.remoteId = msg.peersID;
		c.maxRemotePayload = msg.maxPacketSize;
		c.remoteWin = msg.peersWindow;
		c.maxIncomingPayload = channelMaxPacket;
		this.incoming.push(c);
		await this.conn.write(encode(msgChannelOpenConfirm, {
			peersID: c.remoteId,
			myID: c.localId,
			myWindow: c.myWindow,
			maxPacketSize: c.maxIncomingPayload
		}));
	}

	async open(): Promise<IChannel> {
		var ch = this.newChannel();
		ch.maxIncomingPayload = channelMaxPacket;
		await this.conn.write(encode(msgChannelOpen, {
			peersWindow: ch.myWindow,
			maxPacketSize: ch.maxIncomingPayload,
			peersID: ch.localId
		}));
		if (await ch.ready.shift()) {
			return ch;
		}
		throw "failed to open";
	}

	newChannel(): Channel {
		var ch = new Channel();
		ch.remoteWin = 0;
		ch.myWindow = channelWindowSize;
		ch.ready = new queue();
		ch.readBuf = Buffer.alloc(0);
		ch.readers = [];
		ch.session = this;
		ch.localId = this.addCh(ch);
		return ch;
	}

	async loop() {
		try {
			while (true) {
				var packet = await this.readPacket();
				if (packet === undefined) {
					this.close();
					return;
				}
				if (packet[0] == msgChannelOpen) {
					await this.handleChannelOpen(packet);
					continue;
				}
				var data = new DataView(new Uint8Array(packet).buffer);
				var id = data.getUint32(1);
				var ch = this.getCh(id);
				if (ch === undefined) {
					throw "invalid channel ("+id+") on op "+packet[0];
				}
				await ch.handlePacket(data);
			}
		} catch (e) {
			throw new Error("session readloop: "+e);
		}
		// catch {
		// 	this.channels.forEach(async (ch) => {
		// 		await ch.close();
		// 	})
		// 	this.channels = [];
		// 	await this.conn.close();
		// }
	}

	getCh(id: number): Channel {
		var ch = this.channels[id];
		if (ch.localId !== id) {
			console.log("bad ids:", id, ch.localId, ch.remoteId);
		}
		return ch;
	}
	
	addCh(ch: Channel): number {
		this.channels.forEach((v,i) => {
			if (v === undefined) {
				this.channels[i] = ch;
				return i;
			}
		});
		this.channels.push(ch);
		return this.channels.length-1;
	}

	rmCh(id: number) {
		this.channels[id] = undefined;
	}

	accept(): Promise<IChannel> {
		return this.incoming.shift();
	}

	async close(): Promise<void> {
		for (const id of Object.keys(this.channels)) {
			if (this.channels[id] !== undefined) {
				this.channels[id].shutdown();
			}
		}
		return this.conn.close();
	}
}

// channel represents a virtual muxed connection
export class Channel {
	localId: number;
	remoteId: number;
	maxIncomingPayload: number;
	maxRemotePayload: number;
	session: Session;
	ready: queue;
	sentEOF: boolean;
	gotEOF: boolean;
	sentClose: boolean;
	remoteWin: number;
	myWindow: number;
	readBuf: Buffer;
	readers: Array<Function>;

	ident(): number {
		return this.localId;
	}

	sendPacket(packet: Uint8Array): Promise<number> {
		if (this.sentClose) {
			throw "EOF";
		}
		this.sentClose = (packet[0] === msgChannelClose);
		return this.session.conn.write(Buffer.from(packet));
	}

	sendMessage(type: number, msg: any): Promise<number> {
		var data = new DataView(encode(type, msg).buffer);
		data.setUint32(1, this.remoteId);
		return this.sendPacket(new Uint8Array(data.buffer));
	}

	handlePacket(packet: DataView) {
		if (packet.getUint8(0) === msgChannelData) {
			this.handleData(packet);
			return; 
		}
		if (packet.getUint8(0) === msgChannelClose) {
			this.handleClose();
			return;
		}
		if (packet.getUint8(0) === msgChannelEOF) {
			this.gotEOF = true;
			// if (this.readers.length > 0) {
			// 	this.readers.shift()();
			// }
			return;
		}
		if (packet.getUint8(0) === msgChannelOpenFailure) {
			var fmsg:channelOpenFailureMsg = decode(Buffer.from(packet.buffer));
			this.session.rmCh(fmsg.peersID);
			this.ready.push(false);
			return;
		}
		if (packet.getUint8(0) === msgChannelOpenConfirm) {
			var cmsg:channelOpenConfirmMsg = decode(Buffer.from(packet.buffer));
			if (cmsg.maxPacketSize < minPacketLength || cmsg.maxPacketSize > 1<<30) {
				throw "invalid max packet size";
			}
			this.remoteId = cmsg.myID;
			this.maxRemotePayload = cmsg.maxPacketSize;
			this.remoteWin += cmsg.myWindow;
			this.ready.push(true);
			return;
		}
		if (packet.getUint8(0) === msgChannelWindowAdjust) {
			var amsg:channelWindowAdjustMsg = decode(Buffer.from(packet.buffer));
			this.remoteWin += amsg.additionalBytes;
		}
	}

	async handleData(packet: DataView) {
		var length = packet.getUint32(5);
		if (length == 0) {
			return;
		}
		if (length > this.maxIncomingPayload) {
			throw "incoming packet exceeds maximum payload size";
		}
		var data = Buffer.from(packet.buffer).slice(9);
		// TODO: check packet length
		if (this.myWindow < length) {
			throw "remote side wrote too much";
		}
		this.myWindow -= length;
		this.readBuf = Buffer.concat([this.readBuf, data], this.readBuf.length+data.length);
		if (this.readers.length > 0) {
			this.readers.shift()();
		}
	}

	async adjustWindow(n: number) {
		// TODO
	}

	read(len): Promise<Buffer> {
		return new Promise(resolve => {
			var tryRead = () => {
                if (this.readBuf === undefined) {
                    resolve(undefined);
                    return;
                }
                if (this.readBuf.length >= len) {
                    var data = this.readBuf.slice(0, len);
					this.readBuf = this.readBuf.slice(len);
					resolve(data);
					if (this.readBuf.length == 0 && this.gotEOF) {
						this.readBuf = undefined;
					}
                    return;
				}
                this.readers.push(tryRead);
            }
			tryRead();
		});
	}

	write(buffer: Buffer): Promise<number> {
		if (this.sentEOF) {
			return Promise.reject("EOF");
		}
		// TODO: use window 
		var header = new DataView(new ArrayBuffer(9));
		header.setUint8(0, msgChannelData);
		header.setUint32(1, this.remoteId);
		header.setUint32(5, buffer.byteLength);
		var packet = new Uint8Array(9+buffer.byteLength);
		packet.set(new Uint8Array(header.buffer), 0);
		packet.set(new Uint8Array(buffer), 9);
		return this.sendPacket(packet);
	}

	handleClose(): Promise<void> {
		return this.close();	
	}

	async close(): Promise<void> {
		if (!this.sentClose) {
			await this.sendMessage(msgChannelClose, {
				peersID: this.remoteId
			});
			this.sentClose = true;
			while (await this.ready.shift() !== undefined) {}
			return;
		}
		this.shutdown();
	}

	shutdown() {
		this.readBuf = undefined;
		this.readers.forEach(reader => reader());
		this.ready.close();
		this.session.rmCh(this.localId);
	}

	async closeWrite() {
		this.sentEOF = true;
		await this.sendMessage(msgChannelEOF, {
			peersID: this.remoteId
		});
	}
}

function encode(type: number, obj: any): Buffer {
	switch (type) {
		case msgChannelClose:
			var data = new DataView(new ArrayBuffer(5));
			data.setUint8(0, type);
			data.setUint32(1, (<channelCloseMsg>obj).peersID);
			return Buffer.from(data.buffer);
		case msgChannelData:
			var datamsg = <channelDataMsg>obj;
			var data = new DataView(new ArrayBuffer(9));
			data.setUint8(0, type);
			data.setUint32(1, datamsg.peersID);
			data.setUint32(5, datamsg.length);
			var buf = new Uint8Array(9+datamsg.length);
			buf.set(new Uint8Array(data.buffer), 0);
			buf.set(datamsg.rest, 9);
			return Buffer.from(buf.buffer);
		case msgChannelEOF:
			var data = new DataView(new ArrayBuffer(5));
			data.setUint8(0, type);
			data.setUint32(1, (<channelEOFMsg>obj).peersID);
			return Buffer.from(data.buffer);
		case msgChannelOpen:
			var data = new DataView(new ArrayBuffer(13));
			var openmsg = <channelOpenMsg>obj;
			data.setUint8(0, type);
			data.setUint32(1, openmsg.peersID);
			data.setUint32(5, openmsg.peersWindow);
			data.setUint32(9, openmsg.maxPacketSize);
			return Buffer.from(data.buffer);
		case msgChannelOpenConfirm:
			var data = new DataView(new ArrayBuffer(17));
			var confirmmsg = <channelOpenConfirmMsg>obj;
			data.setUint8(0, type);
			data.setUint32(1, confirmmsg.peersID);
			data.setUint32(5, confirmmsg.myID);
			data.setUint32(9, confirmmsg.myWindow);
			data.setUint32(13, confirmmsg.maxPacketSize);
			return Buffer.from(data.buffer);
		case msgChannelOpenFailure:
			var data = new DataView(new ArrayBuffer(5));
			data.setUint8(0, type);
			data.setUint32(1, (<channelOpenFailureMsg>obj).peersID);
			return Buffer.from(data.buffer);
		case msgChannelWindowAdjust:
			var data = new DataView(new ArrayBuffer(9));
			var adjustmsg = <channelWindowAdjustMsg>obj;
			data.setUint8(0, type);
			data.setUint32(1, adjustmsg.peersID);
			data.setUint32(5, adjustmsg.additionalBytes);
			return Buffer.from(data.buffer);
		default:
			throw "unknown type";
	}
}

function decode(packet: Buffer): any {
	var packetBuf = new Uint8Array(packet).buffer;
	switch (packet[0]) {
		case msgChannelClose:
			var data = new DataView(packetBuf);
			var closeMsg:channelCloseMsg = {
				peersID: data.getUint32(1)
			};
			return closeMsg;
		case msgChannelData:
			var data = new DataView(packetBuf);
			var dataLength = data.getUint32(5);
			var dataMsg:channelDataMsg = {
				peersID: data.getUint32(1),
				length: dataLength,
				rest: new Uint8Array(dataLength),
			};
			dataMsg.rest.set(new Uint8Array(data.buffer.slice(9)));
			return dataMsg;
		case msgChannelEOF:
			var data = new DataView(packetBuf);
			var eofMsg:channelEOFMsg = {
				peersID: data.getUint32(1),
			};
			return eofMsg;
		case msgChannelOpen:
			var data = new DataView(packetBuf);
			var openMsg:channelOpenMsg = {
				peersID: data.getUint32(1),
				peersWindow: data.getUint32(5),
				maxPacketSize: data.getUint32(9),
			};
			return openMsg;
		case msgChannelOpenConfirm:
			var data = new DataView(packetBuf);
			var confirmMsg:channelOpenConfirmMsg = {
				peersID: data.getUint32(1),
				myID: data.getUint32(5),
				myWindow: data.getUint32(9),
				maxPacketSize: data.getUint32(13),
			};
			return confirmMsg;
		case msgChannelOpenFailure:
			var data = new DataView(packetBuf);
			var failureMsg:channelOpenFailureMsg = {
				peersID: data.getUint32(1),
			};
			return failureMsg;
		case msgChannelWindowAdjust:
			var data = new DataView(packetBuf);
			var adjustMsg:channelWindowAdjustMsg = {
				peersID: data.getUint32(1),
				additionalBytes: data.getUint32(5),
			};
			return adjustMsg;
		default:
			throw "unknown type";
	}
}

// export {Session, Channel};

// declare var define: any;
// declare var window: any;

// (function () {

//     let exportables = [Session, Channel];

//     // Node: Export function
//     if (typeof module !== "undefined" && module.exports) {
//         exportables.forEach(exp => module.exports[nameof(exp)] = exp);
//     }
//     // AMD/requirejs: Define the module
//     else if (typeof define === 'function' && define.amd) {
//         exportables.forEach(exp => define(() => exp));
//     }
//     //expose it through Window
//     else if (window) {
//         exportables.forEach(exp => (window as any)[nameof(exp)] = exp);
//     }

//     function nameof(fn: any): string {
//         return typeof fn === 'undefined' ? '' : fn.name ? fn.name : (() => {
//             let result = /^function\s+([\w\$]+)\s*\(/.exec(fn.toString());
//             return !result ? '' : result[1];
//         })();
//     }

// } ());
