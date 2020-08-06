"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// message numbers
var msgChannelOpen = 100;
var msgChannelOpenConfirm = 101;
var msgChannelOpenFailure = 102;
var msgChannelWindowAdjust = 103;
var msgChannelData = 104;
var msgChannelEOF = 105;
var msgChannelClose = 106;
// hardcoded window size constants
var minPacketLength = 9;
var channelMaxPacket = 1 << 15;
var channelWindowSize = 64 * channelMaxPacket;
// queue primitive for incoming connections and
// signaling channel ready state
var queue = /** @class */ (function () {
    function queue() {
        this.q = [];
        this.waiters = [];
        this.closed = false;
    }
    queue.prototype.push = function (obj) {
        if (this.closed)
            throw "closed queue";
        if (this.waiters.length > 0) {
            this.waiters.shift()(obj);
            return;
        }
        this.q.push(obj);
    };
    queue.prototype.shift = function () {
        var _this = this;
        if (this.closed)
            return;
        return new Promise(function (resolve) {
            if (_this.q.length > 0) {
                resolve(_this.q.shift());
                return;
            }
            _this.waiters.push(resolve);
        });
    };
    queue.prototype.close = function () {
        if (this.closed)
            return;
        this.closed = true;
        this.waiters.forEach(function (waiter) {
            waiter(undefined);
        });
    };
    return queue;
}());
// session class that manages the "connection"
var Session = /** @class */ (function () {
    function Session(conn) {
        this.conn = conn;
        this.channels = [];
        this.incoming = new queue();
        this.loop();
    }
    Session.prototype.readPacket = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sizes, msg, rest, view, length, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        sizes = new Map([
                            [msgChannelOpen, 12],
                            [msgChannelOpenConfirm, 16],
                            [msgChannelOpenFailure, 4],
                            [msgChannelWindowAdjust, 8],
                            [msgChannelData, 8],
                            [msgChannelEOF, 4],
                            [msgChannelClose, 4],
                        ]);
                        return [4 /*yield*/, this.conn.read(1)];
                    case 1:
                        msg = _a.sent();
                        if (msg === undefined) {
                            return [2 /*return*/];
                        }
                        if (msg[0] < msgChannelOpen || msg[0] > msgChannelClose) {
                            return [2 /*return*/, Promise.reject("bad packet: " + msg[0])];
                        }
                        return [4 /*yield*/, this.conn.read(sizes.get(msg[0]))];
                    case 2:
                        rest = _a.sent();
                        if (rest === undefined) {
                            return [2 /*return*/, Promise.reject("unexpected EOF")];
                        }
                        if (!(msg[0] === msgChannelData)) return [3 /*break*/, 4];
                        view = new DataView(new Uint8Array(rest).buffer);
                        length = view.getUint32(4);
                        return [4 /*yield*/, this.conn.read(length)];
                    case 3:
                        data = _a.sent();
                        if (data === undefined) {
                            return [2 /*return*/, Promise.reject("unexpected EOF")];
                        }
                        return [2 /*return*/, Buffer.concat([msg, rest, data], length + rest.length + 1)];
                    case 4: return [2 /*return*/, Buffer.concat([msg, rest], rest.length + 1)];
                }
            });
        });
    };
    Session.prototype.handleChannelOpen = function (packet) {
        return __awaiter(this, void 0, void 0, function () {
            var msg, c;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        msg = decode(packet);
                        if (!(msg.maxPacketSize < minPacketLength || msg.maxPacketSize > 1 << 30)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.conn.write(encode(msgChannelOpenFailure, {
                                peersID: msg.peersID
                            }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                    case 2:
                        c = this.newChannel();
                        c.remoteId = msg.peersID;
                        c.maxRemotePayload = msg.maxPacketSize;
                        c.remoteWin = msg.peersWindow;
                        c.maxIncomingPayload = channelMaxPacket;
                        this.incoming.push(c);
                        return [4 /*yield*/, this.conn.write(encode(msgChannelOpenConfirm, {
                                peersID: c.remoteId,
                                myID: c.localId,
                                myWindow: c.myWindow,
                                maxPacketSize: c.maxIncomingPayload
                            }))];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Session.prototype.open = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ch;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ch = this.newChannel();
                        ch.maxIncomingPayload = channelMaxPacket;
                        return [4 /*yield*/, this.conn.write(encode(msgChannelOpen, {
                                peersWindow: ch.myWindow,
                                maxPacketSize: ch.maxIncomingPayload,
                                peersID: ch.localId
                            }))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, ch.ready.shift()];
                    case 2:
                        if (_a.sent()) {
                            return [2 /*return*/, ch];
                        }
                        throw "failed to open";
                }
            });
        });
    };
    Session.prototype.newChannel = function () {
        var ch = new Channel();
        ch.remoteWin = 0;
        ch.myWindow = channelWindowSize;
        ch.ready = new queue();
        ch.readBuf = Buffer.alloc(0);
        ch.readers = [];
        ch.session = this;
        ch.localId = this.addCh(ch);
        return ch;
    };
    Session.prototype.loop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var packet, data, id, ch, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        _a.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.readPacket()];
                    case 2:
                        packet = _a.sent();
                        if (packet === undefined) {
                            this.close();
                            return [2 /*return*/];
                        }
                        if (!(packet[0] == msgChannelOpen)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.handleChannelOpen(packet)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 4:
                        data = new DataView(new Uint8Array(packet).buffer);
                        id = data.getUint32(1);
                        ch = this.getCh(id);
                        if (ch === undefined) {
                            throw "invalid channel (" + id + ") on op " + packet[0];
                        }
                        return [4 /*yield*/, ch.handlePacket(data)];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        e_1 = _a.sent();
                        throw new Error("session readloop: " + e_1);
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    Session.prototype.getCh = function (id) {
        var ch = this.channels[id];
        if (ch.localId !== id) {
            console.log("bad ids:", id, ch.localId, ch.remoteId);
        }
        return ch;
    };
    Session.prototype.addCh = function (ch) {
        var _this = this;
        this.channels.forEach(function (v, i) {
            if (v === undefined) {
                _this.channels[i] = ch;
                return i;
            }
        });
        this.channels.push(ch);
        return this.channels.length - 1;
    };
    Session.prototype.rmCh = function (id) {
        this.channels[id] = undefined;
    };
    Session.prototype.accept = function () {
        return this.incoming.shift();
    };
    Session.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, id;
            return __generator(this, function (_b) {
                for (_i = 0, _a = Object.keys(this.channels); _i < _a.length; _i++) {
                    id = _a[_i];
                    if (this.channels[id] !== undefined) {
                        this.channels[id].shutdown();
                    }
                }
                return [2 /*return*/, this.conn.close()];
            });
        });
    };
    return Session;
}());
exports.Session = Session;
// channel represents a virtual muxed connection
var Channel = /** @class */ (function () {
    function Channel() {
    }
    Channel.prototype.ident = function () {
        return this.localId;
    };
    Channel.prototype.sendPacket = function (packet) {
        if (this.sentClose) {
            throw "EOF";
        }
        this.sentClose = (packet[0] === msgChannelClose);
        return this.session.conn.write(Buffer.from(packet));
    };
    Channel.prototype.sendMessage = function (type, msg) {
        var data = new DataView(encode(type, msg).buffer);
        data.setUint32(1, this.remoteId);
        return this.sendPacket(new Uint8Array(data.buffer));
    };
    Channel.prototype.handlePacket = function (packet) {
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
            var fmsg = decode(Buffer.from(packet.buffer));
            this.session.rmCh(fmsg.peersID);
            this.ready.push(false);
            return;
        }
        if (packet.getUint8(0) === msgChannelOpenConfirm) {
            var cmsg = decode(Buffer.from(packet.buffer));
            if (cmsg.maxPacketSize < minPacketLength || cmsg.maxPacketSize > 1 << 30) {
                throw "invalid max packet size";
            }
            this.remoteId = cmsg.myID;
            this.maxRemotePayload = cmsg.maxPacketSize;
            this.remoteWin += cmsg.myWindow;
            this.ready.push(true);
            return;
        }
        if (packet.getUint8(0) === msgChannelWindowAdjust) {
            var amsg = decode(Buffer.from(packet.buffer));
            this.remoteWin += amsg.additionalBytes;
        }
    };
    Channel.prototype.handleData = function (packet) {
        return __awaiter(this, void 0, void 0, function () {
            var length, data;
            return __generator(this, function (_a) {
                length = packet.getUint32(5);
                if (length == 0) {
                    return [2 /*return*/];
                }
                if (length > this.maxIncomingPayload) {
                    throw "incoming packet exceeds maximum payload size";
                }
                data = Buffer.from(packet.buffer).slice(9);
                // TODO: check packet length
                if (this.myWindow < length) {
                    throw "remot side wrote too much";
                }
                this.myWindow -= length;
                this.readBuf = Buffer.concat([this.readBuf, data], this.readBuf.length + data.length);
                if (this.readers.length > 0) {
                    this.readers.shift()();
                }
                return [2 /*return*/];
            });
        });
    };
    Channel.prototype.adjustWindow = function (n) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        });
    };
    Channel.prototype.read = function (len) {
        var _this = this;
        return new Promise(function (resolve) {
            var tryRead = function () {
                if (_this.readBuf === undefined) {
                    resolve(undefined);
                    return;
                }
                if (_this.readBuf.length >= len) {
                    var data = _this.readBuf.slice(0, len);
                    _this.readBuf = _this.readBuf.slice(len);
                    resolve(data);
                    if (_this.readBuf.length == 0 && _this.gotEOF) {
                        _this.readBuf = undefined;
                    }
                    return;
                }
                _this.readers.push(tryRead);
            };
            tryRead();
        });
    };
    Channel.prototype.write = function (buffer) {
        if (this.sentEOF) {
            return Promise.reject("EOF");
        }
        // TODO: use window 
        var header = new DataView(new ArrayBuffer(9));
        header.setUint8(0, msgChannelData);
        header.setUint32(1, this.remoteId);
        header.setUint32(5, buffer.byteLength);
        var packet = new Uint8Array(9 + buffer.byteLength);
        packet.set(new Uint8Array(header.buffer), 0);
        packet.set(new Uint8Array(buffer), 9);
        return this.sendPacket(packet);
    };
    Channel.prototype.handleClose = function () {
        return this.close();
    };
    Channel.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.sentClose) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.sendMessage(msgChannelClose, {
                                peersID: this.remoteId
                            })];
                    case 1:
                        _a.sent();
                        this.sentClose = true;
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.ready.shift()];
                    case 3:
                        if (!((_a.sent()) !== undefined)) return [3 /*break*/, 4];
                        return [3 /*break*/, 2];
                    case 4: return [2 /*return*/];
                    case 5:
                        this.shutdown();
                        return [2 /*return*/];
                }
            });
        });
    };
    Channel.prototype.shutdown = function () {
        this.readBuf = undefined;
        this.readers.forEach(function (reader) { return reader(); });
        this.ready.close();
        this.session.rmCh(this.localId);
    };
    Channel.prototype.closeWrite = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.sentEOF = true;
                        return [4 /*yield*/, this.sendMessage(msgChannelEOF, {
                                peersID: this.remoteId
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return Channel;
}());
exports.Channel = Channel;
function encode(type, obj) {
    switch (type) {
        case msgChannelClose:
            var data = new DataView(new ArrayBuffer(5));
            data.setUint8(0, type);
            data.setUint32(1, obj.peersID);
            return Buffer.from(data.buffer);
        case msgChannelData:
            var datamsg = obj;
            var data = new DataView(new ArrayBuffer(9));
            data.setUint8(0, type);
            data.setUint32(1, datamsg.peersID);
            data.setUint32(5, datamsg.length);
            var buf = new Uint8Array(9 + datamsg.length);
            buf.set(new Uint8Array(data.buffer), 0);
            buf.set(datamsg.rest, 9);
            return Buffer.from(buf.buffer);
        case msgChannelEOF:
            var data = new DataView(new ArrayBuffer(5));
            data.setUint8(0, type);
            data.setUint32(1, obj.peersID);
            return Buffer.from(data.buffer);
        case msgChannelOpen:
            var data = new DataView(new ArrayBuffer(13));
            var openmsg = obj;
            data.setUint8(0, type);
            data.setUint32(1, openmsg.peersID);
            data.setUint32(5, openmsg.peersWindow);
            data.setUint32(9, openmsg.maxPacketSize);
            return Buffer.from(data.buffer);
        case msgChannelOpenConfirm:
            var data = new DataView(new ArrayBuffer(17));
            var confirmmsg = obj;
            data.setUint8(0, type);
            data.setUint32(1, confirmmsg.peersID);
            data.setUint32(5, confirmmsg.myID);
            data.setUint32(9, confirmmsg.myWindow);
            data.setUint32(13, confirmmsg.maxPacketSize);
            return Buffer.from(data.buffer);
        case msgChannelOpenFailure:
            var data = new DataView(new ArrayBuffer(5));
            data.setUint8(0, type);
            data.setUint32(1, obj.peersID);
            return Buffer.from(data.buffer);
        case msgChannelWindowAdjust:
            var data = new DataView(new ArrayBuffer(9));
            var adjustmsg = obj;
            data.setUint8(0, type);
            data.setUint32(1, adjustmsg.peersID);
            data.setUint32(5, adjustmsg.additionalBytes);
            return Buffer.from(data.buffer);
        default:
            throw "unknown type";
    }
}
function decode(packet) {
    var packetBuf = new Uint8Array(packet).buffer;
    switch (packet[0]) {
        case msgChannelClose:
            var data = new DataView(packetBuf);
            var closeMsg = {
                peersID: data.getUint32(1)
            };
            return closeMsg;
        case msgChannelData:
            var data = new DataView(packetBuf);
            var dataLength = data.getUint32(5);
            var dataMsg = {
                peersID: data.getUint32(1),
                length: dataLength,
                rest: new Uint8Array(dataLength),
            };
            dataMsg.rest.set(new Uint8Array(data.buffer.slice(9)));
            return dataMsg;
        case msgChannelEOF:
            var data = new DataView(packetBuf);
            var eofMsg = {
                peersID: data.getUint32(1),
            };
            return eofMsg;
        case msgChannelOpen:
            var data = new DataView(packetBuf);
            var openMsg = {
                peersID: data.getUint32(1),
                peersWindow: data.getUint32(5),
                maxPacketSize: data.getUint32(9),
            };
            return openMsg;
        case msgChannelOpenConfirm:
            var data = new DataView(packetBuf);
            var confirmMsg = {
                peersID: data.getUint32(1),
                myID: data.getUint32(5),
                myWindow: data.getUint32(9),
                maxPacketSize: data.getUint32(13),
            };
            return confirmMsg;
        case msgChannelOpenFailure:
            var data = new DataView(packetBuf);
            var failureMsg = {
                peersID: data.getUint32(1),
            };
            return failureMsg;
        case msgChannelWindowAdjust:
            var data = new DataView(packetBuf);
            var adjustMsg = {
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
