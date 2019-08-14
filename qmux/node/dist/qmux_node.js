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
var qmux = require("./qmux");
var WebSocket = require("ws");
var net = require("net");
exports.Session = qmux.Session;
exports.Channel = qmux.Channel;
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
function DialTCP(port, host) {
    return new Promise(function (resolve) {
        var socket = net.createConnection(port, host, function () {
            resolve(new TCPConn(socket));
        });
    });
}
exports.DialTCP = DialTCP;
function ListenTCP(port, host) {
    return __awaiter(this, void 0, void 0, function () {
        var listener;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    listener = new TCPListener();
                    return [4 /*yield*/, listener.listen(port, host)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, listener];
            }
        });
    });
}
exports.ListenTCP = ListenTCP;
var TCPListener = /** @class */ (function () {
    function TCPListener() {
        this.pending = new queue();
    }
    TCPListener.prototype.listen = function (port, host) {
        var _this = this;
        return new Promise(function (resolve) {
            _this.server = net.createServer(function (c) {
                _this.pending.push(new qmux.Session(new TCPConn(c)));
            });
            _this.server.on('error', function (err) {
                throw err;
            });
            _this.server.on("close", function () {
                _this.pending.close();
            });
            _this.server.listen(port, host, resolve);
        });
    };
    TCPListener.prototype.accept = function () {
        return this.pending.shift();
    };
    TCPListener.prototype.close = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.server.close(function (err) {
                if (err !== undefined) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    };
    return TCPListener;
}());
exports.TCPListener = TCPListener;
var TCPConn = /** @class */ (function () {
    function TCPConn(socket) {
        var _this = this;
        this.socket = socket;
        this.socket.on('error', function (err) { return _this.error = err; });
    }
    TCPConn.prototype.read = function (len) {
        var _this = this;
        var stream = this.socket;
        return new Promise(function (resolve, reject) {
            if (_this.error) {
                var err = _this.error;
                delete _this.error;
                return reject(err);
            }
            if (!stream.readable || stream.destroyed) {
                return resolve();
            }
            var readableHandler = function () {
                var chunk = stream.read(len);
                if (chunk != null) {
                    removeListeners();
                    resolve(chunk);
                }
            };
            var closeHandler = function () {
                removeListeners();
                resolve();
            };
            var endHandler = function () {
                removeListeners();
                resolve();
            };
            var errorHandler = function (err) {
                delete _this.error;
                removeListeners();
                reject(err);
            };
            var removeListeners = function () {
                stream.removeListener('close', closeHandler);
                stream.removeListener('error', errorHandler);
                stream.removeListener('end', endHandler);
                stream.removeListener('readable', readableHandler);
            };
            stream.on('close', closeHandler);
            stream.on('end', endHandler);
            stream.on('error', errorHandler);
            stream.on('readable', readableHandler);
            readableHandler();
        });
    };
    TCPConn.prototype.write = function (buffer) {
        var _this = this;
        return new Promise(function (resolve) {
            _this.socket.write(buffer, function () { return resolve(buffer.byteLength); });
        });
    };
    TCPConn.prototype.close = function () {
        var _this = this;
        return new Promise(function (resolve) {
            _this.socket.destroy();
            resolve();
        });
    };
    return TCPConn;
}());
exports.TCPConn = TCPConn;
function DialWebsocket(addr) {
    return new Promise(function (resolve, reject) {
        var socket = new WebSocket(addr, { perMessageDeflate: false });
        socket.on("open", function () {
            resolve(new WebsocketConn(socket));
        });
        socket.on("error", function (err) {
            reject(err);
        });
    });
}
exports.DialWebsocket = DialWebsocket;
function ListenWebsocket(port, host) {
    return __awaiter(this, void 0, void 0, function () {
        var listener;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    listener = new WebsocketListener();
                    return [4 /*yield*/, listener.listen(port, host)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, listener];
            }
        });
    });
}
exports.ListenWebsocket = ListenWebsocket;
var WebsocketListener = /** @class */ (function () {
    function WebsocketListener() {
        this.pending = new queue();
    }
    WebsocketListener.prototype.listen = function (port, host) {
        var _this = this;
        return new Promise(function (resolve) {
            _this.server = new WebSocket.Server({
                host: host,
                port: port,
                perMessageDeflate: false,
            }, resolve);
            _this.server.on("connection", function (c) {
                _this.pending.push(new qmux.Session(new WebsocketConn(c)));
            });
            _this.server.on("error", function (err) {
                throw err;
            });
            _this.server.on("close", function () {
                _this.pending.close();
            });
        });
    };
    WebsocketListener.prototype.accept = function () {
        return this.pending.shift();
    };
    WebsocketListener.prototype.close = function () {
        var _this = this;
        return new Promise(function (resolve) {
            _this.server.close(function () { return resolve(); });
        });
    };
    return WebsocketListener;
}());
exports.WebsocketListener = WebsocketListener;
var WebsocketConn = /** @class */ (function () {
    function WebsocketConn(socket) {
        var _this = this;
        this.isClosed = false;
        this.buf = Buffer.alloc(0);
        this.waiters = [];
        this.socket = socket;
        this.socket.on("message", function (data) {
            var buf = data;
            _this.buf = Buffer.concat([_this.buf, buf], _this.buf.length + buf.length);
            if (_this.waiters.length > 0) {
                _this.waiters.shift()();
            }
        });
        this.socket.on("close", function () {
            _this.close();
        });
        this.socket.on("error", function (err) {
            console.log("err", err);
        });
    }
    WebsocketConn.prototype.read = function (len) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var tryRead = function () {
                if (_this.buf === undefined) {
                    resolve(undefined);
                    return;
                }
                if (_this.buf.length >= len) {
                    var data = _this.buf.slice(0, len);
                    _this.buf = _this.buf.slice(len);
                    resolve(data);
                    return;
                }
                _this.waiters.push(tryRead);
            };
            tryRead();
        });
    };
    WebsocketConn.prototype.write = function (buffer) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.socket.send(buffer, { binary: true }, function () {
                resolve(buffer.length);
            });
        });
    };
    WebsocketConn.prototype.close = function () {
        var _this = this;
        if (this.isClosed)
            return Promise.resolve();
        return new Promise(function (resolve, reject) {
            _this.isClosed = true;
            _this.buf = undefined;
            _this.waiters.forEach(function (waiter) { return waiter(); });
            _this.socket.close();
            resolve();
        });
    };
    return WebsocketConn;
}());
exports.WebsocketConn = WebsocketConn;
