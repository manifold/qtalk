var qmux = require("../../../qmux/node/dist/qmux_node.js");
var qrpc = require("../dist/qrpc.js");

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

