var qmux = require("../../qmux/node/dist/qmux_node.js");
var qrpc = require("./dist/qrpc.js");

var session = null;
var listener = null;

(async () => {
    var api = new qrpc.API();
    api.handle("demo", qrpc.Export({
        "lower": function(v) {
            return v.toLowerCase();
        }
    }));

    listener = await qmux.ListenWebsocket(4242);
    var server = new qrpc.Server();
    await server.serve(listener, api);
})().catch(async (err) => { 
    console.log(err.stack);
});


(async () => {
    console.log("dialing...")
    var conn = await qmux.DialWebsocket("ws://localhost:4242");
    conn.client = true;
    session = new qmux.Session(conn);
    console.log("connected...")
    var client = new qrpc.Client(session);
    console.log("calling...")
    console.log((await client.call("demo/lower", "HELLO WORLD!")).reply);
    await session.close();
    await listener.close();

})().catch(async (err) => { 
    console.log(err.stack);
});