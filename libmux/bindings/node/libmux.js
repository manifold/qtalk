"use strict";
exports.__esModule = true;
var ffi = require("ffi");
var ref = require("ref");
var ArrayType = require("ref-array");
var Struct = require("ref-struct");
var ByteArray = ArrayType(ref.types.uint8);
var GoString = Struct({
    p: "string",
    n: "longlong"
});
function goStr(str) {
    var s = new GoString();
    s["p"] = str;
    s["n"] = s["p"].length;
    return s;
}
var libmux = ffi.Library(__dirname + "/../../build/libmux", {
    Error: ["int32", ["int32", ByteArray, "int32"]],
    TestError: ["int32", [ByteArray, "int32"]],
    DumpRefs: ["void", []],
    DialTCP: ["int32", [ByteArray, "int32"]],
    ListenTCP: ["int32", [ByteArray, "int32"]],
    DialWebsocket: ["int32", [ByteArray, "int32"]],
    ListenWebsocket: ["int32", [ByteArray, "int32"]],
    ListenerClose: ["int32", ["int32"]],
    ListenerAccept: ["int32", ["int32"]],
    SessionOpen: ["int32", ["int32"]],
    SessionAccept: ["int32", ["int32"]],
    SessionClose: ["int32", ["int32"]],
    ChannelRead: ["int32", ["int32", ByteArray, "int32"]],
    ChannelWrite: ["int32", ["int32", ByteArray, "int32"]],
    ChannelClose: ["int32", ["int32"]]
});
function lookupErr(id) {
    var buf = ByteArray(1 << 8);
    var n = libmux.Error(id, buf, buf.length);
    return buf.buffer.slice(0, n).toString('ascii');
}
exports.ops = [];
function handle(reject, name, retHandler) {
    return function (err, retcode) {
        exports.ops.splice(exports.ops.indexOf(name), 1);
        if (err) {
            reject("ffi: " + err);
            return;
        }
        if (retcode < 0) {
            reject(name + "[" + (retcode * -1) + "]: " + lookupErr(retcode));
            return;
        }
        retHandler(retcode);
    };
}
function TestError(str) {
    var buf = ByteArray(Buffer.from(str));
    exports.ops.push("TestError");
    return new Promise(function (resolve, reject) {
        libmux.TestError.async(buf, buf.length, function (err, ret) {
            if (ret === 0) {
                resolve();
            }
            console.log(ret);
            reject(lookupErr(ret));
        });
    });
}
exports.TestError = TestError;
function ListenTCP(addr) {
    var buf = ByteArray(Buffer.from(addr));
    exports.ops.push("ListenTCP");
    return new Promise(function (resolve, reject) {
        libmux.ListenTCP.async(buf, buf.length, handle(reject, "ListenTCP", function (retcode) {
            if (retcode === 0) {
                resolve();
                return;
            }
            resolve(new Listener(retcode));
        }));
    });
}
exports.ListenTCP = ListenTCP;
function DialTCP(addr) {
    var buf = ByteArray(Buffer.from(addr));
    exports.ops.push("DialTCP");
    return new Promise(function (resolve, reject) {
        libmux.DialTCP.async(buf, buf.length, handle(reject, "DialTCP", function (retcode) {
            if (retcode === 0) {
                resolve();
                return;
            }
            resolve(new Session(retcode));
        }));
    });
}
exports.DialTCP = DialTCP;
function ListenWebsocket(addr) {
    var buf = ByteArray(Buffer.from(addr));
    exports.ops.push("ListenWebsocket");
    return new Promise(function (resolve, reject) {
        libmux.ListenWebsocket.async(buf, buf.length, handle(reject, "ListenWebsocket", function (retcode) {
            if (retcode === 0) {
                resolve();
                return;
            }
            resolve(new Listener(retcode));
        }));
    });
}
exports.ListenWebsocket = ListenWebsocket;
function DialWebsocket(addr) {
    var buf = ByteArray(Buffer.from(addr));
    exports.ops.push("DialWebsocket");
    return new Promise(function (resolve, reject) {
        libmux.DialWebsocket.async(buf, buf.length, handle(reject, "DialWebsocket", function (retcode) {
            if (retcode === 0) {
                resolve();
                return;
            }
            resolve(new Session(retcode));
        }));
    });
}
exports.DialWebsocket = DialWebsocket;
var Listener = /** @class */ (function () {
    function Listener(id) {
        this.id = id;
        this.closed = false;
    }
    Listener.prototype.accept = function () {
        var _this = this;
        if (this.closed)
            return new Promise(function (r) { return r(); });
        exports.ops.push("ListenerAccept");
        return new Promise(function (resolve, reject) {
            libmux.ListenerAccept.async(_this.id, handle(reject, "ListenerAccept", function (retcode) {
                if (retcode === 0) {
                    resolve();
                    return;
                }
                resolve(new Session(retcode));
            }));
        });
    };
    Listener.prototype.close = function () {
        var _this = this;
        if (this.closed)
            return Promise.resolve();
        exports.ops.push("ListenerClose");
        return new Promise(function (resolve, reject) {
            libmux.ListenerClose.async(_this.id, handle(reject, "ListenerClose", function () {
                _this.closed = true;
                resolve();
            }));
        });
    };
    return Listener;
}());
var Session = /** @class */ (function () {
    function Session(id) {
        this.id = id;
        this.closed = false;
    }
    Session.prototype.open = function () {
        var _this = this;
        if (this.closed)
            return new Promise(function (r) { return r(); });
        exports.ops.push("SessionOpen");
        return new Promise(function (resolve, reject) {
            libmux.SessionOpen.async(_this.id, handle(reject, "SessionOpen", function (retcode) {
                if (retcode === 0) {
                    resolve();
                    return;
                }
                resolve(new Channel(retcode));
            }));
        });
    };
    Session.prototype.accept = function () {
        var _this = this;
        if (this.closed)
            return new Promise(function (r) { return r(); });
        exports.ops.push("SessionAccept");
        return new Promise(function (resolve, reject) {
            libmux.SessionAccept.async(_this.id, handle(reject, "SessionAccept", function (retcode) {
                if (retcode === 0) {
                    resolve();
                    return;
                }
                resolve(new Channel(retcode));
            }));
        });
    };
    Session.prototype.close = function () {
        var _this = this;
        if (this.closed)
            return Promise.resolve();
        exports.ops.push("SessionClose");
        return new Promise(function (resolve, reject) {
            libmux.SessionClose.async(_this.id, handle(reject, "SessionClose", function () {
                _this.closed = true;
                resolve();
            }));
        });
    };
    return Session;
}());
var Channel = /** @class */ (function () {
    function Channel(id) {
        this.id = id;
        this.closed = false;
    }
    Channel.prototype.read = function (len) {
        var _this = this;
        if (this.closed)
            return new Promise(function (r) { return r(); });
        exports.ops.push("ChannelRead");
        return new Promise(function (resolve, reject) {
            var buffer = ByteArray(len);
            libmux.ChannelRead.async(_this.id, buffer, buffer.length, handle(reject, "ChannelRead", function (retcode) {
                if (retcode === 0) {
                    _this.closed = true;
                    resolve();
                    return;
                }
                resolve(buffer.buffer.slice(0, retcode));
            }));
        });
    };
    Channel.prototype.write = function (buf) {
        var _this = this;
        if (this.closed)
            return new Promise(function (r) { return r(); });
        exports.ops.push("ChannelWrite");
        return new Promise(function (resolve, reject) {
            var buffer = ByteArray(buf);
            libmux.ChannelWrite.async(_this.id, buffer, buffer.length, handle(reject, "ChannelWrite", function (retcode) { return resolve(retcode); }));
        });
    };
    Channel.prototype.close = function () {
        var _this = this;
        if (this.closed)
            return Promise.resolve();
        exports.ops.push("ChannelClose");
        return new Promise(function (resolve, reject) {
            libmux.ChannelClose.async(_this.id, handle(reject, "ChannelClose", function () {
                _this.closed = true;
                resolve();
            }));
        });
    };
    return Channel;
}());
