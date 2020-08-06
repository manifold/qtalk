// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.

// This is a specialised implementation of a System module loader.

"use strict";

// @ts-nocheck
/* eslint-disable */
let System, __instantiate;
(() => {
  const r = new Map();

  System = {
    register(id, d, f) {
      r.set(id, { d, f, exp: {} });
    },
  };
  async function dI(mid, src) {
    let id = mid.replace(/\.\w+$/i, "");
    if (id.includes("./")) {
      const [o, ...ia] = id.split("/").reverse(),
        [, ...sa] = src.split("/").reverse(),
        oa = [o];
      let s = 0,
        i;
      while ((i = ia.shift())) {
        if (i === "..") s++;
        else if (i === ".") break;
        else oa.push(i);
      }
      if (s < sa.length) oa.push(...sa.slice(s));
      id = oa.reverse().join("/");
    }
    return r.has(id) ? gExpA(id) : import(mid);
  }

  function gC(id, main) {
    return {
      id,
      import: (m) => dI(m, id),
      meta: { url: id, main },
    };
  }

  function gE(exp) {
    return (id, v) => {
      v = typeof id === "string" ? { [id]: v } : id;
      for (const [id, value] of Object.entries(v)) {
        Object.defineProperty(exp, id, {
          value,
          writable: true,
          enumerable: true,
        });
      }
    };
  }

  function rF(main) {
    for (const [id, m] of r.entries()) {
      const { f, exp } = m;
      const { execute: e, setters: s } = f(gE(exp), gC(id, id === main));
      delete m.f;
      m.e = e;
      m.s = s;
    }
  }

  async function gExpA(id) {
    if (!r.has(id)) return;
    const m = r.get(id);
    if (m.s) {
      const { d, e, s } = m;
      delete m.s;
      delete m.e;
      for (let i = 0; i < s.length; i++) s[i](await gExpA(d[i]));
      const r = e();
      if (r) await r;
    }
    return m.exp;
  }

  function gExp(id) {
    if (!r.has(id)) return;
    const m = r.get(id);
    if (m.s) {
      const { d, e, s } = m;
      delete m.s;
      delete m.e;
      for (let i = 0; i < s.length; i++) s[i](gExp(d[i]));
      e();
    }
    return m.exp;
  }
  __instantiate = (m, a) => {
    System = __instantiate = undefined;
    rF(m);
    return a ? gExpA(m) : gExp(m);
  };
})();

System.register("api", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("codec/message", [], function (exports_2, context_2) {
    "use strict";
    var OpenID, OpenConfirmID, OpenFailureID, WindowAdjustID, DataID, EofID, CloseID, payloadSizes;
    var __moduleName = context_2 && context_2.id;
    return {
        setters: [],
        execute: function () {
            exports_2("OpenID", OpenID = 100);
            exports_2("OpenConfirmID", OpenConfirmID = 101);
            exports_2("OpenFailureID", OpenFailureID = 102);
            exports_2("WindowAdjustID", WindowAdjustID = 103);
            exports_2("DataID", DataID = 104);
            exports_2("EofID", EofID = 105);
            exports_2("CloseID", CloseID = 106);
            exports_2("payloadSizes", payloadSizes = new Map([
                [OpenID, 12],
                [OpenConfirmID, 16],
                [OpenFailureID, 4],
                [WindowAdjustID, 8],
                [DataID, 8],
                [EofID, 4],
                [CloseID, 4],
            ]));
        }
    };
});
System.register("codec/encoder", ["codec/message"], function (exports_3, context_3) {
    "use strict";
    var msg, Encoder;
    var __moduleName = context_3 && context_3.id;
    function Marshal(obj) {
        if (obj.ID === msg.CloseID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(5));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.channelID);
            return new Uint8Array(data.buffer);
        }
        if (obj.ID === msg.DataID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(9));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.channelID);
            data.setUint32(5, m.length);
            let buf = new Uint8Array(9 + m.length);
            buf.set(new Uint8Array(data.buffer), 0);
            buf.set(m.data, 9);
            return buf;
        }
        if (obj.ID === msg.EofID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(5));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.channelID);
            return new Uint8Array(data.buffer);
        }
        if (obj.ID === msg.OpenID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(13));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.senderID);
            data.setUint32(5, m.windowSize);
            data.setUint32(9, m.maxPacketSize);
            return new Uint8Array(data.buffer);
        }
        if (obj.ID === msg.OpenConfirmID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(17));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.channelID);
            data.setUint32(5, m.senderID);
            data.setUint32(9, m.windowSize);
            data.setUint32(13, m.maxPacketSize);
            return new Uint8Array(data.buffer);
        }
        if (obj.ID === msg.OpenFailureID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(5));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.channelID);
            return new Uint8Array(data.buffer);
        }
        if (obj.ID === msg.WindowAdjustID) {
            let m = obj;
            let data = new DataView(new ArrayBuffer(9));
            data.setUint8(0, m.ID);
            data.setUint32(1, m.channelID);
            data.setUint32(5, m.additionalBytes);
            return new Uint8Array(data.buffer);
        }
        throw `marshal of unknown type: ${obj}`;
    }
    exports_3("Marshal", Marshal);
    return {
        setters: [
            function (msg_1) {
                msg = msg_1;
            }
        ],
        execute: function () {
            Encoder = class Encoder {
                constructor(conn, debug = false) {
                    this.conn = conn;
                    this.debug = debug;
                }
                async encode(m) {
                    if (this.debug) {
                        console.log("<<", m);
                    }
                    return this.conn.write(Marshal(m));
                }
            };
            exports_3("Encoder", Encoder);
        }
    };
});
System.register("util", [], function (exports_4, context_4) {
    "use strict";
    var queue;
    var __moduleName = context_4 && context_4.id;
    function concat(list, totalLength) {
        let buf = new Uint8Array(totalLength);
        let offset = 0;
        list.forEach((el) => {
            buf.set(el, offset);
            offset += el.length;
        });
        return buf;
    }
    exports_4("concat", concat);
    return {
        setters: [],
        execute: function () {
            queue = class queue {
                constructor() {
                    this.q = [];
                    this.waiters = [];
                    this.closed = false;
                }
                push(obj) {
                    if (this.closed)
                        throw "closed queue";
                    if (this.waiters.length > 0) {
                        let waiter = this.waiters.shift();
                        if (waiter)
                            waiter(obj);
                        return;
                    }
                    this.q.push(obj);
                }
                shift() {
                    if (this.closed)
                        return Promise.resolve(undefined);
                    return new Promise(resolve => {
                        if (this.q.length > 0) {
                            resolve(this.q.shift());
                            return;
                        }
                        this.waiters.push(resolve);
                    });
                }
                close() {
                    if (this.closed)
                        return;
                    this.closed = true;
                    this.waiters.forEach(waiter => {
                        waiter(undefined);
                    });
                }
            };
            exports_4("queue", queue);
        }
    };
});
System.register("codec/decoder", ["codec/message", "util"], function (exports_5, context_5) {
    "use strict";
    var msg, util, Decoder;
    var __moduleName = context_5 && context_5.id;
    async function readPacket(conn) {
        let head = await conn.read(1);
        if (head === undefined) {
            return Promise.resolve(undefined);
        }
        let msgID = head[0];
        let size = msg.payloadSizes.get(msgID);
        if (size === undefined || msgID < msg.OpenID || msgID > msg.CloseID) {
            return Promise.reject(`bad packet: ${msgID}`);
        }
        let rest = await conn.read(size);
        if (rest === undefined) {
            return Promise.reject("unexpected EOF");
        }
        if (msgID === msg.DataID) {
            let view = new DataView(rest.buffer);
            let length = view.getUint32(4);
            let data = await conn.read(length);
            if (data === undefined) {
                return Promise.reject("unexpected EOF");
            }
            return util.concat([head, rest, data], length + rest.length + 1);
        }
        return util.concat([head, rest], rest.length + 1);
    }
    function Unmarshal(packet) {
        let data = new DataView(packet.buffer);
        switch (packet[0]) {
            case msg.CloseID:
                return {
                    ID: packet[0],
                    channelID: data.getUint32(1)
                };
            case msg.DataID:
                let dataLength = data.getUint32(5);
                let rest = new Uint8Array(packet.buffer.slice(9));
                return {
                    ID: packet[0],
                    channelID: data.getUint32(1),
                    length: dataLength,
                    data: rest,
                };
            case msg.EofID:
                return {
                    ID: packet[0],
                    channelID: data.getUint32(1)
                };
            case msg.OpenID:
                return {
                    ID: packet[0],
                    senderID: data.getUint32(1),
                    windowSize: data.getUint32(5),
                    maxPacketSize: data.getUint32(9),
                };
            case msg.OpenConfirmID:
                return {
                    ID: packet[0],
                    channelID: data.getUint32(1),
                    senderID: data.getUint32(5),
                    windowSize: data.getUint32(9),
                    maxPacketSize: data.getUint32(13),
                };
            case msg.OpenFailureID:
                return {
                    ID: packet[0],
                    channelID: data.getUint32(1),
                };
            case msg.WindowAdjustID:
                return {
                    ID: packet[0],
                    channelID: data.getUint32(1),
                    additionalBytes: data.getUint32(5),
                };
            default:
                throw `unmarshal of unknown type: ${packet[0]}`;
        }
    }
    exports_5("Unmarshal", Unmarshal);
    return {
        setters: [
            function (msg_2) {
                msg = msg_2;
            },
            function (util_1) {
                util = util_1;
            }
        ],
        execute: function () {
            Decoder = class Decoder {
                constructor(conn, debug = false) {
                    this.conn = conn;
                    this.debug = debug;
                }
                async decode() {
                    let packet = await readPacket(this.conn);
                    if (packet === undefined) {
                        return Promise.resolve(undefined);
                    }
                    let msg = Unmarshal(packet);
                    if (this.debug) {
                        console.log(">>", msg);
                    }
                    return msg;
                }
            };
            exports_5("Decoder", Decoder);
        }
    };
});
System.register("codec/index", ["codec/message", "codec/encoder", "codec/decoder"], function (exports_6, context_6) {
    "use strict";
    var __moduleName = context_6 && context_6.id;
    function exportStar_1(m) {
        var exports = {};
        for (var n in m) {
            if (n !== "default") exports[n] = m[n];
        }
        exports_6(exports);
    }
    return {
        setters: [
            function (message_ts_1_1) {
                exportStar_1(message_ts_1_1);
            },
            function (encoder_ts_1_1) {
                exportStar_1(encoder_ts_1_1);
            },
            function (decoder_ts_1_1) {
                exportStar_1(decoder_ts_1_1);
            }
        ],
        execute: function () {
        }
    };
});
System.register("session", ["codec/index", "util", "internal"], function (exports_7, context_7) {
    "use strict";
    var codec, util, internal, minPacketLength, maxPacketLength, Session;
    var __moduleName = context_7 && context_7.id;
    return {
        setters: [
            function (codec_1) {
                codec = codec_1;
            },
            function (util_2) {
                util = util_2;
            },
            function (internal_1) {
                internal = internal_1;
            }
        ],
        execute: function () {
            exports_7("minPacketLength", minPacketLength = 9);
            exports_7("maxPacketLength", maxPacketLength = Number.MAX_VALUE);
            Session = class Session {
                constructor(conn, debug = false) {
                    this.conn = conn;
                    this.enc = new codec.Encoder(conn, debug);
                    this.dec = new codec.Decoder(conn, debug);
                    this.channels = [];
                    this.incoming = new util.queue();
                    this.loop();
                }
                async open() {
                    let ch = this.newChannel();
                    ch.maxIncomingPayload = internal.channelMaxPacket;
                    await this.enc.encode({
                        ID: codec.OpenID,
                        windowSize: ch.myWindow,
                        maxPacketSize: ch.maxIncomingPayload,
                        senderID: ch.localId
                    });
                    if (await ch.ready.shift()) {
                        return ch;
                    }
                    throw "failed to open";
                }
                accept() {
                    return this.incoming.shift();
                }
                async close() {
                    for (const ids of Object.keys(this.channels)) {
                        let id = parseInt(ids);
                        if (this.channels[id] !== undefined) {
                            this.channels[id].shutdown();
                        }
                    }
                    return this.conn.close();
                }
                async loop() {
                    try {
                        while (true) {
                            let msg = await this.dec.decode();
                            if (msg === undefined) {
                                this.close();
                                return;
                            }
                            if (msg.ID === codec.OpenID) {
                                await this.handleOpen(msg);
                                continue;
                            }
                            let cmsg = msg;
                            let ch = this.getCh(cmsg.channelID);
                            if (ch === undefined) {
                                throw `invalid channel (${cmsg.channelID}) on op ${cmsg.ID}`;
                            }
                            await ch.handle(cmsg);
                        }
                    }
                    catch (e) {
                        throw new Error(`session readloop: ${e}`);
                    }
                }
                async handleOpen(msg) {
                    if (msg.maxPacketSize < minPacketLength || msg.maxPacketSize > maxPacketLength) {
                        await this.enc.encode({
                            ID: codec.OpenFailureID,
                            channelID: msg.senderID
                        });
                        return;
                    }
                    let c = this.newChannel();
                    c.remoteId = msg.senderID;
                    c.maxRemotePayload = msg.maxPacketSize;
                    c.remoteWin = msg.windowSize;
                    c.maxIncomingPayload = internal.channelMaxPacket;
                    this.incoming.push(c);
                    await this.enc.encode({
                        ID: codec.OpenConfirmID,
                        channelID: c.remoteId,
                        senderID: c.localId,
                        windowSize: c.myWindow,
                        maxPacketSize: c.maxIncomingPayload
                    });
                }
                newChannel() {
                    let ch = new internal.Channel(this);
                    ch.remoteWin = 0;
                    ch.myWindow = internal.channelWindowSize;
                    ch.readBuf = new Uint8Array(0);
                    ch.localId = this.addCh(ch);
                    return ch;
                }
                getCh(id) {
                    let ch = this.channels[id];
                    if (ch.localId !== id) {
                        console.log("bad ids:", id, ch.localId, ch.remoteId);
                    }
                    return ch;
                }
                addCh(ch) {
                    this.channels.forEach((v, i) => {
                        if (v === undefined) {
                            this.channels[i] = ch;
                            return i;
                        }
                    });
                    this.channels.push(ch);
                    return this.channels.length - 1;
                }
                rmCh(id) {
                    delete this.channels[id];
                }
            };
            exports_7("Session", Session);
        }
    };
});
System.register("channel", ["util", "codec/index", "internal"], function (exports_8, context_8) {
    "use strict";
    var util, codec, internal, channelMaxPacket, channelWindowSize, Channel;
    var __moduleName = context_8 && context_8.id;
    return {
        setters: [
            function (util_3) {
                util = util_3;
            },
            function (codec_2) {
                codec = codec_2;
            },
            function (internal_2) {
                internal = internal_2;
            }
        ],
        execute: function () {
            exports_8("channelMaxPacket", channelMaxPacket = 1 << 15);
            exports_8("channelWindowSize", channelWindowSize = 64 * channelMaxPacket);
            Channel = class Channel {
                constructor(sess) {
                    this.localId = 0;
                    this.remoteId = 0;
                    this.maxIncomingPayload = 0;
                    this.maxRemotePayload = 0;
                    this.sentEOF = false;
                    this.gotEOF = false;
                    this.sentClose = false;
                    this.remoteWin = 0;
                    this.myWindow = 0;
                    this.ready = new util.queue();
                    this.session = sess;
                    this.readers = [];
                }
                ident() {
                    return this.localId;
                }
                read(len) {
                    return new Promise(resolve => {
                        let tryRead = () => {
                            if (this.readBuf === undefined) {
                                resolve(undefined);
                                return;
                            }
                            if (this.readBuf.length >= len) {
                                let data = this.readBuf.slice(0, len);
                                this.readBuf = this.readBuf.slice(len);
                                resolve(data);
                                if (this.readBuf.length == 0 && this.gotEOF) {
                                    this.readBuf = undefined;
                                }
                                return;
                            }
                            this.readers.push(tryRead);
                        };
                        tryRead();
                    });
                }
                write(buffer) {
                    if (this.sentEOF) {
                        return Promise.reject("EOF");
                    }
                    return this.send({
                        ID: codec.DataID,
                        channelID: this.remoteId,
                        length: buffer.byteLength,
                        data: buffer
                    });
                }
                async closeWrite() {
                    this.sentEOF = true;
                    await this.send({
                        ID: codec.EofID,
                        channelID: this.remoteId
                    });
                }
                async close() {
                    if (!this.sentClose) {
                        await this.send({
                            ID: codec.CloseID,
                            channelID: this.remoteId
                        });
                        this.sentClose = true;
                        while (await this.ready.shift() !== undefined) { }
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
                async adjustWindow(n) {
                }
                send(msg) {
                    if (this.sentClose) {
                        throw "EOF";
                    }
                    this.sentClose = (msg.ID === codec.CloseID);
                    return this.session.enc.encode(msg);
                }
                handle(msg) {
                    if (msg.ID === codec.DataID) {
                        this.handleData(msg);
                        return;
                    }
                    if (msg.ID === codec.CloseID) {
                        this.close();
                        return;
                    }
                    if (msg.ID === codec.EofID) {
                        this.gotEOF = true;
                        return;
                    }
                    if (msg.ID === codec.OpenFailureID) {
                        this.session.rmCh(msg.channelID);
                        this.ready.push(false);
                        return;
                    }
                    if (msg.ID === codec.OpenConfirmID) {
                        if (msg.maxPacketSize < internal.minPacketLength || msg.maxPacketSize > internal.maxPacketLength) {
                            throw "invalid max packet size";
                        }
                        this.remoteId = msg.senderID;
                        this.maxRemotePayload = msg.maxPacketSize;
                        this.remoteWin += msg.windowSize;
                        this.ready.push(true);
                        return;
                    }
                    if (msg.ID === codec.WindowAdjustID) {
                        this.remoteWin += msg.additionalBytes;
                    }
                }
                handleData(msg) {
                    if (msg.length > this.maxIncomingPayload) {
                        throw "incoming packet exceeds maximum payload size";
                    }
                    if (this.myWindow < msg.length) {
                        throw "remote side wrote too much";
                    }
                    this.myWindow -= msg.length;
                    if (this.readBuf) {
                        this.readBuf = util.concat([this.readBuf, msg.data], this.readBuf.length + msg.data.length);
                    }
                    if (this.readers.length > 0) {
                        let reader = this.readers.shift();
                        if (reader)
                            reader();
                    }
                }
            };
            exports_8("Channel", Channel);
        }
    };
});
System.register("internal", ["session", "channel"], function (exports_9, context_9) {
    "use strict";
    var __moduleName = context_9 && context_9.id;
    function exportStar_2(m) {
        var exports = {};
        for (var n in m) {
            if (n !== "default") exports[n] = m[n];
        }
        exports_9(exports);
    }
    return {
        setters: [
            function (session_ts_1_1) {
                exportStar_2(session_ts_1_1);
            },
            function (channel_ts_1_1) {
                exportStar_2(channel_ts_1_1);
            }
        ],
        execute: function () {
        }
    };
});
System.register("transport/websocket", ["util"], function (exports_10, context_10) {
    "use strict";
    var util, Conn;
    var __moduleName = context_10 && context_10.id;
    function Dial(addr) {
        return new Promise((resolve, reject) => {
            var socket = new WebSocket(addr);
            socket.onopen = () => resolve(new Conn(socket));
            socket.onerror = (err) => reject(err);
        });
    }
    exports_10("Dial", Dial);
    return {
        setters: [
            function (util_4) {
                util = util_4;
            }
        ],
        execute: function () {
            Conn = class Conn {
                constructor(socket) {
                    this.isClosed = false;
                    this.buf = new Uint8Array(0);
                    this.waiters = [];
                    this.socket = socket;
                    this.socket.binaryType = "arraybuffer";
                    this.socket.onmessage = (event) => {
                        var buf = new Uint8Array(event.data);
                        this.buf = util.concat([this.buf, buf], this.buf.length + buf.length);
                        if (this.waiters.length > 0) {
                            let waiter = this.waiters.shift();
                            if (waiter)
                                waiter();
                        }
                    };
                    this.socket.onclose = () => this.close();
                    this.socket.onerror = (err) => console.log("err", err);
                }
                read(len) {
                    return new Promise((resolve) => {
                        var tryRead = () => {
                            if (this.isClosed) {
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
                        };
                        tryRead();
                    });
                }
                write(buffer) {
                    this.socket.send(buffer);
                    return Promise.resolve(buffer.byteLength);
                }
                close() {
                    if (this.isClosed)
                        return Promise.resolve();
                    return new Promise((resolve) => {
                        this.isClosed = true;
                        this.waiters.forEach(waiter => waiter());
                        this.socket.close();
                        resolve();
                    });
                }
            };
            exports_10("Conn", Conn);
        }
    };
});
System.register("index", ["internal", "transport/websocket"], function (exports_11, context_11) {
    "use strict";
    var __moduleName = context_11 && context_11.id;
    function exportStar_3(m) {
        var exports = {};
        for (var n in m) {
            if (n !== "default") exports[n] = m[n];
        }
        exports_11(exports);
    }
    return {
        setters: [
            function (internal_ts_1_1) {
                exportStar_3(internal_ts_1_1);
            },
            function (websocket_ts_1_1) {
                exportStar_3(websocket_ts_1_1);
            }
        ],
        execute: function () {
        }
    };
});

const __exp = __instantiate("index", false);
export const minPacketLength = __exp["minPacketLength"];
export const maxPacketLength = __exp["maxPacketLength"];
export const Session = __exp["Session"];
export const channelMaxPacket = __exp["channelMaxPacket"];
export const channelWindowSize = __exp["channelWindowSize"];
export const Channel = __exp["Channel"];
export const Dial = __exp["Dial"];
export const Conn = __exp["Conn"];
