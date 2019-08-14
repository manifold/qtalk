class MockListener {
    constructor(pair) {
        this.pair = pair;
    }

    accept() {
        if (this.session !== undefined) {
            return new Promise(res => {
                this.acceptCloser = res;
            })
        }
        this.session = new MockSession(this.pair);
        this.pair.pair = this.session;
        return new Promise(res => res(this.session));
    }

    close() {
        if (this.acceptCloser !== undefined) {
            this.acceptCloser();
        }
        return new Promise(async (res) => {
            await this.session.close();
            res();
        });
    }
}

class MockSession {
    constructor(pair) {
        this.pair = pair;
        this.ch = [];
        this.closed = false;
        this.pendingAccept = [];
        this.pendingOpen = [];
    }

    close() {
        if (this.closed) return Promise.resolve();
        return new Promise(async (res) => {
            this.closed = true;
            this.ch.forEach(ch => ch.close());
            await this.pair.close();
            res();
        });
    }

    open() {
        return new Promise((resolve, reject) => {
            if (this.pendingOpen.length > 0) {
                var pending = this.pendingOpen.shift();
                var openCh = new MockChannel(pending.ch);
                this.ch.push(openCh);
                resolve(openCh);
                pending.resolve(pending.ch);
                return;
            }
            this.pair.pendingAccept.push({
                ch: new MockChannel(),
                resolve: resolve
            });
        })
    }

    accept() {
        return new Promise((resolve, reject) => {
            if (this.pendingAccept.length > 0) {
                var pending = this.pendingAccept.shift();
                var acceptCh = new MockChannel(pending.ch);
                this.ch.push(acceptCh);
                resolve(acceptCh);
                pending.resolve(pending.ch);
                return;
            }
            this.pair.pendingOpen.push({
                ch: new MockChannel(),
                resolve: resolve
            });
        })
    }
}

class MockChannel {
    constructor(pair) {
        if (pair !== undefined) {
            this.pair = pair;
            pair.pair = this;
        }
        this.buf = [];
        this.waiters = [];
        this.closed = false;
        this.once = false;
    }

    close() {
        if (this.closed) return Promise.resolve();
        return new Promise(res => {
            this.closed = true;
            this.buf = undefined;
            this.waiters.forEach(waiter => waiter(undefined));
            res();
        });
    }

    write(buffer) {
        return new Promise((resolve, reject) => {
            var written = 0;
            for (const value of buffer) {
                if (this.pair.buf !== undefined) {
                    this.pair.buf.push(value);
                    written++;
                } else {
                    break;
                }
            }
            if (this.pair.waiters.length > 0) {
                this.pair.waiters.shift()();
            }
            resolve(written);
        });
    }

    read(len) {
        return new Promise((resolve, reject) => {
            var tryRead = () => {
                if (this.buf === undefined) {
                    resolve(undefined);
                    return;
                }
                if (this.buf.length >= len) {
                    var data = this.buf.splice(0, len);
                    var buf = Buffer.from(new Uint8Array(data).buffer);
                    resolve(buf);
                    return;
                }
                this.waiters.push(tryRead);
            }
            tryRead();
        });
    }
}

var session = new MockSession();
var listener = new MockListener(session);

// (async () => {
    
//     var sess = await listener.accept();
//     var ch = await sess.accept();
//     console.log("|Server echoing on channel...");
//     while(true) {
//         var data = await ch.read(1);
//         if (data === undefined) {
//             console.log("|Server got EOF");
//             break;
//         }
//         await ch.write(data);
//     }

// })().catch(async (err) => { 
//     console.log(err.stack);
// });

// (async () => {
    
//     var ch = await session.open();
    
//     await ch.write(Buffer.from("Hello"));
//     await ch.write(Buffer.from(" "));
//     await ch.write(Buffer.from("world"));
    
//     var data = await ch.read(11);
//     console.log(data.toString('ascii'));

//     await session.close();

//     //await new Promise(res => setTimeout(res, 1000));
// })().catch(async (err) => { 
//     console.log(err.stack);
// });

var qrpc = require("./dist/qrpc.js");

(async () => {
    var api = new qrpc.API();
    api.handle("demo", qrpc.Export({
        "lower": function(v) {
            return v.toLowerCase();
        }
    }));

    //console.log("serving...");
    var server = new qrpc.Server();
    await server.serve(listener, api);
    //console.log("closing...");
    await listener.close();
})().catch(async (err) => { 
    console.log(err.stack);
});


(async () => {
    //console.log("connecting...");
    var client = new qrpc.Client(session);
    console.log((await client.call("demo/lower", "HELLO WORLD!")).reply);
    await session.close();

})().catch(async (err) => { 
    console.log(err.stack);
});