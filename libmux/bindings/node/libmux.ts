import * as ffi from "ffi";
import * as ref from "ref";

import * as ArrayType from "ref-array";
import * as Struct from "ref-struct";

let ByteArray = ArrayType(ref.types.uint8);
let GoString = Struct({
  p: "string",
  n: "longlong"
});

function goStr(str: string): any {
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
  ChannelClose: ["int32", ["int32"]],
});

function lookupErr(id: number): string {
  var buf = ByteArray(1<<8);
  var n = libmux.Error(id, buf, buf.length);
  return buf.buffer.slice(0,n).toString('ascii');
}

export var ops = [];

function handle(reject, name, retHandler) {
  return (err, retcode) => {
    ops.splice(ops.indexOf(name), 1);
    if (err) {
      reject("ffi: "+err);
      return;
    }
    if (retcode < 0) {
      reject(name+"["+(retcode*-1)+"]: "+lookupErr(retcode));
      return;
    }
    retHandler(retcode);
  };
}

export function TestError(str: string): Promise<void> {
  var buf = ByteArray(Buffer.from(str));
  ops.push("TestError");
  return new Promise((resolve, reject) => {
    libmux.TestError.async(buf, buf.length, (err, ret) => {
      if (ret === 0) {
        resolve();
      }
      console.log(ret);
      reject(lookupErr(ret));
    });
  });
}

export function ListenTCP(addr: string): Promise<Listener> {
  var buf = ByteArray(Buffer.from(addr));
  ops.push("ListenTCP");
  return new Promise((resolve, reject) => {
    libmux.ListenTCP.async(buf, buf.length, handle(reject, "ListenTCP", (retcode) => {
      if (retcode === 0) {
        resolve();
        return;
      }
      resolve(new Listener(retcode));
    }));
  });
}

export function DialTCP(addr: string): Promise<Session> {
  var buf = ByteArray(Buffer.from(addr));
  ops.push("DialTCP");
  return new Promise((resolve, reject) => {
    libmux.DialTCP.async(buf, buf.length, handle(reject, "DialTCP", (retcode) => {
      if (retcode === 0) {
        resolve();
        return;
      }
      resolve(new Session(retcode));
    }));
  });
}

export function ListenWebsocket(addr: string): Promise<Listener> {
  var buf = ByteArray(Buffer.from(addr));
  ops.push("ListenWebsocket");
  return new Promise((resolve, reject) => {
    libmux.ListenWebsocket.async(buf, buf.length, handle(reject, "ListenWebsocket", (retcode) => {
      if (retcode === 0) {
        resolve();
        return;
      }
      resolve(new Listener(retcode));
    }));
  });
}

export function DialWebsocket(addr: string): Promise<Session> {
  var buf = ByteArray(Buffer.from(addr));
  ops.push("DialWebsocket");
  return new Promise((resolve, reject) => {
    libmux.DialWebsocket.async(buf, buf.length, handle(reject, "DialWebsocket", (retcode) => {
      if (retcode === 0) {
        resolve();
        return;
      }
      resolve(new Session(retcode));
    }));
  });
}

class Listener {
  id: number;
  closed: boolean;

  constructor(id: number) {
    this.id = id;
    this.closed = false;
  }

  accept(): Promise<Session> {
    if (this.closed) return new Promise(r => r());
    ops.push("ListenerAccept");
    return new Promise((resolve, reject) => {
      libmux.ListenerAccept.async(this.id, handle(reject, "ListenerAccept", (retcode) => {
        if (retcode === 0) {
          resolve();
          return;
        }
        resolve(new Session(retcode));
      }));
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    ops.push("ListenerClose");
    return new Promise((resolve, reject) => {
      libmux.ListenerClose.async(this.id, handle(reject, "ListenerClose", () => {
        this.closed = true;
        resolve();
      }));
    });
  }
}

class Session {
  id: number;
  closed: boolean;

  constructor(id: number) {
    this.id = id;
    this.closed = false;
  }

  open(): Promise<Channel> {
    if (this.closed) return new Promise(r => r());
    ops.push("SessionOpen");
    return new Promise((resolve, reject) => {
      libmux.SessionOpen.async(this.id, handle(reject, "SessionOpen", (retcode) => {
        if (retcode === 0) {
          resolve();
          return;
        }
        resolve(new Channel(retcode));
      }));
    });
  }

  accept(): Promise<Channel> {
    if (this.closed) return new Promise(r => r());
    ops.push("SessionAccept");
    return new Promise((resolve, reject) => {
      libmux.SessionAccept.async(this.id, handle(reject, "SessionAccept", (retcode) => {
        if (retcode === 0) {
          resolve();
          return;
        }
        resolve(new Channel(retcode));
      }));
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    ops.push("SessionClose");
    return new Promise((resolve, reject) => {
      libmux.SessionClose.async(this.id, handle(reject, "SessionClose", () => {
        this.closed = true;
        resolve();
      }));
    });
  }
}

class Channel {
  id: number;
  closed: boolean;

  constructor(id: number) {
    this.id = id;
    this.closed = false;
  }

  read(len: number): Promise<Buffer> {
    if (this.closed) return new Promise(r => r());
    ops.push("ChannelRead");
    return new Promise((resolve, reject) => {
      var buffer = ByteArray(len);
      libmux.ChannelRead.async(this.id, buffer, buffer.length, handle(reject, "ChannelRead", (retcode) => {
        if (retcode === 0) {
          this.closed = true;
          resolve();
          return;
        }
        resolve(buffer.buffer.slice(0, retcode));
      }));
    });
  }

  write(buf: Buffer): Promise<number> {
    if (this.closed) return new Promise(r => r());
    ops.push("ChannelWrite");
    return new Promise((resolve, reject) => {
      var buffer = ByteArray(buf);
      libmux.ChannelWrite.async(this.id, buffer, buffer.length, handle(reject, "ChannelWrite", (retcode) => resolve(retcode)));
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    ops.push("ChannelClose");
    return new Promise((resolve, reject) => {
      libmux.ChannelClose.async(this.id, handle(reject, "ChannelClose", () => {
        this.closed = true;
        resolve();
      }));
    });
  }
}