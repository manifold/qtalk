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
var msgpack = require("msgpack-lite");
function errable(p) {
    return p
        .then(function (ret) { return [ret, null]; })
        .catch(function (err) { return [null, err]; });
}
function sleep(ms) {
    return new Promise(function (res) { return setTimeout(res, ms); });
}
function loopYield(name) {
    //console.log(name);
    //return sleep(10);
    return Promise.resolve();
}
// only one codec per channel because of read loop!
var FrameCodec = /** @class */ (function () {
    function FrameCodec(channel, readLimit) {
        if (readLimit === void 0) { readLimit = -1; }
        this.channel = channel;
        this.codec = msgpack;
        this.buf = [];
        this.waiters = [];
        this.readLimit = readLimit;
        this.readCount = 0;
        this.readLoop();
    }
    FrameCodec.prototype.readLoop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sbuf, sdata, size, buf, v, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!true) return [3 /*break*/, 7];
                        if (this.readLimit > 0 && this.readCount >= this.readLimit) {
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, loopYield("readloop")];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.channel.read(4)];
                    case 3:
                        sbuf = _a.sent();
                        if (sbuf === undefined) {
                            //console.log("DEBUG: readloop exited on length");
                            return [2 /*return*/];
                        }
                        sdata = new DataView(new Uint8Array(sbuf).buffer);
                        size = sdata.getUint32(0);
                        return [4 /*yield*/, this.channel.read(size)];
                    case 4:
                        buf = _a.sent();
                        if (buf === undefined) {
                            //console.log("DEBUG: readloop exited on data");
                            return [2 /*return*/];
                        }
                        this.readCount++;
                        v = this.codec.decode(buf);
                        if (this.waiters.length > 0) {
                            this.waiters.shift()(v);
                            return [3 /*break*/, 0];
                        }
                        this.buf.push(v);
                        return [3 /*break*/, 6];
                    case 5:
                        e_1 = _a.sent();
                        throw new Error("codec readLoop: " + e_1);
                    case 6: return [3 /*break*/, 0];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    FrameCodec.prototype.encode = function (v) {
        return __awaiter(this, void 0, void 0, function () {
            var buf, sdata;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        buf = this.codec.encode(v);
                        sdata = new DataView(new ArrayBuffer(4));
                        sdata.setUint32(0, buf.length);
                        return [4 /*yield*/, this.channel.write(Buffer.from(sdata.buffer))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.channel.write(buf)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, Promise.resolve()];
                }
            });
        });
    };
    FrameCodec.prototype.decode = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.buf.length > 0) {
                resolve(_this.buf.shift());
                return;
            }
            _this.waiters.push(resolve);
        });
    };
    return FrameCodec;
}());
var API = /** @class */ (function () {
    function API() {
        this.handlers = {};
    }
    API.prototype.handle = function (path, handler) {
        this.handlers[path] = handler;
    };
    API.prototype.handleFunc = function (path, handler) {
        var _this = this;
        this.handle(path, {
            serveRPC: function (rr, cc) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, handler(rr, cc)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); }
        });
    };
    API.prototype.handler = function (path) {
        for (var p in this.handlers) {
            if (this.handlers.hasOwnProperty(p)) {
                if (path.startsWith(p)) {
                    return this.handlers[p];
                }
            }
        }
    };
    API.prototype.serveAPI = function (session, ch) {
        return __awaiter(this, void 0, void 0, function () {
            var codec, cdata, call, header, resp, handler;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        codec = new FrameCodec(ch);
                        return [4 /*yield*/, codec.decode()];
                    case 1:
                        cdata = _a.sent();
                        call = new Call(cdata.Destination);
                        call.parse();
                        call.decode = function () { return codec.decode(); };
                        call.caller = new Client(session);
                        header = new ResponseHeader();
                        resp = new responder(ch, codec, header);
                        handler = this.handler(call.Destination);
                        if (!handler) {
                            resp.return(new Error("handler does not exist for this destination: " + call.Destination));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, handler.serveRPC(resp, call)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, Promise.resolve()];
                }
            });
        });
    };
    return API;
}());
exports.API = API;
var responder = /** @class */ (function () {
    function responder(ch, codec, header) {
        this.ch = ch;
        this.codec = codec;
        this.header = header;
    }
    responder.prototype.return = function (v) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (v instanceof Error) {
                            this.header.Error = v.message;
                            v = null;
                        }
                        return [4 /*yield*/, this.codec.encode(this.header)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.codec.encode(v)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, this.ch.close()];
                }
            });
        });
    };
    responder.prototype.hijack = function (v) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (v instanceof Error) {
                            this.header.Error = v.message;
                            v = null;
                        }
                        this.header.Hijacked = true;
                        return [4 /*yield*/, this.codec.encode(this.header)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.codec.encode(v)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, this.ch];
                }
            });
        });
    };
    return responder;
}());
var ResponseHeader = /** @class */ (function () {
    function ResponseHeader() {
    }
    return ResponseHeader;
}());
var Response = /** @class */ (function () {
    function Response() {
    }
    return Response;
}());
var Call = /** @class */ (function () {
    function Call(Destination) {
        this.Destination = Destination;
    }
    Call.prototype.parse = function () {
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
        this.method = parts.pop();
        this.objectPath = parts.join("/");
    };
    return Call;
}());
exports.Call = Call;
var Client = /** @class */ (function () {
    function Client(session, api) {
        this.session = session;
        this.api = api;
    }
    Client.prototype.serveAPI = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ch;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.api === undefined) {
                            this.api = new API();
                        }
                        _a.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.session.accept()];
                    case 2:
                        ch = _a.sent();
                        if (ch === undefined) {
                            return [2 /*return*/];
                        }
                        this.api.serveAPI(this.session, ch);
                        return [4 /*yield*/, loopYield("client channel accept loop")];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    Client.prototype.close = function () {
        return this.session.close();
    };
    Client.prototype.call = function (path, args) {
        return __awaiter(this, void 0, void 0, function () {
            var ch, codec, header, resp, _a, e_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 10, , 12]);
                        return [4 /*yield*/, this.session.open()];
                    case 1:
                        ch = _b.sent();
                        codec = new FrameCodec(ch, 2);
                        return [4 /*yield*/, codec.encode(new Call(path))];
                    case 2:
                        _b.sent();
                        return [4 /*yield*/, codec.encode(args)];
                    case 3:
                        _b.sent();
                        return [4 /*yield*/, codec.decode()];
                    case 4:
                        header = _b.sent();
                        if (!(header.Error !== undefined && header.Error !== null)) return [3 /*break*/, 6];
                        return [4 /*yield*/, ch.close()];
                    case 5:
                        _b.sent();
                        return [2 /*return*/, Promise.reject(header.Error)];
                    case 6:
                        resp = new Response();
                        resp.error = header.Error;
                        resp.hijacked = header.Hijacked;
                        resp.channel = ch;
                        _a = resp;
                        return [4 /*yield*/, codec.decode()];
                    case 7:
                        _a.reply = _b.sent();
                        if (!(resp.hijacked !== true)) return [3 /*break*/, 9];
                        return [4 /*yield*/, ch.close()];
                    case 8:
                        _b.sent();
                        _b.label = 9;
                    case 9: return [2 /*return*/, resp];
                    case 10:
                        e_2 = _b.sent();
                        return [4 /*yield*/, ch.close()];
                    case 11:
                        _b.sent();
                        console.error(e_2);
                        return [3 /*break*/, 12];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    return Client;
}());
exports.Client = Client;
var Server = /** @class */ (function () {
    function Server() {
    }
    Server.prototype.serveAPI = function (sess) {
        return __awaiter(this, void 0, void 0, function () {
            var ch;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!true) return [3 /*break*/, 3];
                        return [4 /*yield*/, sess.accept()];
                    case 1:
                        ch = _a.sent();
                        if (ch === undefined) {
                            sess.close();
                            return [2 /*return*/];
                        }
                        this.API.serveAPI(sess, ch);
                        return [4 /*yield*/, loopYield("server channel accept loop")];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    Server.prototype.serve = function (l, api) {
        return __awaiter(this, void 0, void 0, function () {
            var sess;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (api) {
                            this.API = api;
                        }
                        if (!this.API) {
                            this.API = new API();
                        }
                        _a.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, l.accept()];
                    case 2:
                        sess = _a.sent();
                        if (sess === undefined) {
                            return [2 /*return*/];
                        }
                        this.serveAPI(sess);
                        return [4 /*yield*/, loopYield("server connection accept loop")];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return Server;
}());
exports.Server = Server;
function exportFunc(fn, rcvr) {
    return {
        serveRPC: function (r, c) {
            return __awaiter(this, void 0, void 0, function () {
                var args, _a, _b, e_3;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, c.decode()];
                        case 1:
                            args = _c.sent();
                            _c.label = 2;
                        case 2:
                            _c.trys.push([2, 4, , 5]);
                            _b = (_a = r).return;
                            return [4 /*yield*/, fn.apply(rcvr, [args])];
                        case 3:
                            _b.apply(_a, [((_c.sent()) || null)]);
                            return [3 /*break*/, 5];
                        case 4:
                            e_3 = _c.sent();
                            switch (typeof e_3) {
                                case 'string':
                                    r.return(new Error(e_3));
                                case 'undefined':
                                    r.return(new Error("unknown error"));
                                case 'object':
                                    r.return(new Error(e_3.message));
                                default:
                                    r.return(new Error("unknown error: " + e_3));
                            }
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        }
    };
}
function Export(v) {
    if (typeof v === 'function') {
        return exportFunc(v, null);
    }
    if (typeof v != 'object') {
        throw new Error("can only export functions and objects");
    }
    var handlers = {};
    if (v.constructor.name === "Object") {
        for (var key in v) {
            if (v.hasOwnProperty(key) && typeof v[key] === 'function') {
                handlers[key] = exportFunc(v[key], v);
            }
        }
    }
    else {
        var props = Object.getOwnPropertyNames(Object.getPrototypeOf(v));
        for (var idx in props) {
            var propName = props[idx];
            if (propName != "constructor" && typeof v[propName] === 'function') {
                handlers[propName] = exportFunc(v[propName], v);
            }
        }
    }
    return {
        serveRPC: function (r, c) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!handlers.hasOwnProperty(c.method)) {
                                r.return(new Error("method handler does not exist for this destination: " + c.method));
                                return [2 /*return*/];
                            }
                            return [4 /*yield*/, handlers[c.method].serveRPC(r, c)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        }
    };
}
exports.Export = Export;
function uuid4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (cc) {
        var rr = Math.random() * 16 | 0;
        return (cc === 'x' ? rr : (rr & 0x3 | 0x8)).toString(16);
    });
}
var ObjectManager = /** @class */ (function () {
    function ObjectManager() {
        this.values = {};
        this.mountPath = "/";
    }
    ObjectManager.prototype.object = function (path) {
        var id = path.replace(this.mountPath, "");
        if (id[0] === "/") {
            id = id.substr(1);
        }
        var v = this.values[id];
        if (!v) {
            return undefined;
        }
        return new ManagedObject(this, id, v);
    };
    ObjectManager.prototype.register = function (v) {
        var id = uuid4();
        this.values[id] = v;
        return new ManagedObject(this, id, v);
    };
    ObjectManager.prototype.serveRPC = function (r, c) {
        return __awaiter(this, void 0, void 0, function () {
            var parts, id, v;
            return __generator(this, function (_a) {
                parts = c.objectPath.split("/");
                id = parts.pop();
                v = this.values[id];
                if (!v) {
                    r.return(new Error("object not registered: " + c.objectPath));
                    return [2 /*return*/];
                }
                if (typeof v.serveRPC === "function") {
                    v.serveRPC(r, c);
                }
                else {
                    Export(v).serveRPC(r, c);
                }
                return [2 /*return*/];
            });
        });
    };
    ObjectManager.prototype.mount = function (api, path) {
        this.mountPath = path;
        api.handle(path, this);
    };
    return ObjectManager;
}());
exports.ObjectManager = ObjectManager;
var ManagedObject = /** @class */ (function () {
    function ManagedObject(manager, id, value) {
        this.manager = manager;
        this.id = id;
        this.value = value;
    }
    ManagedObject.prototype.dispose = function () {
        delete this.manager.values[this.id];
    };
    ManagedObject.prototype.path = function () {
        return [this.manager.mountPath, this.id].join("/");
    };
    ManagedObject.prototype.handle = function () {
        return { "ObjectPath": this.path() };
    };
    return ManagedObject;
}());
