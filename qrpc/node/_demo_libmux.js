var libmux = require("libmux");
var qrpc = require("./qrpc.js");

var session = null;
var listener = null;

(async () => {
    var api = new qrpc.API();
    api.handle("demo", qrpc.Export({
        "lower": function(v) {
            return v.toLowerCase();
        }
    }));

    listener = await libmux.ListenWebsocket("localhost:4242");
    var server = new qrpc.Server();
    await server.serve(listener, api);
    //await listener.close();
})().catch(async (err) => { 
    console.log(err.stack);
});


(async () => {
    console.log("dialing...")
    session = await libmux.DialWebsocket("localhost:4242");
    console.log("connected...")
    var client = new qrpc.Client(session);
    console.log("calling...")
    console.log(await client.call("demo/lower", "HELLO WORLD!"));
    await session.close();

})().catch(async (err) => { 
    console.log(err.stack);
});