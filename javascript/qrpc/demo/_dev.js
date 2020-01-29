var qrpc = require("./qrpc.js");
var libmux = require("libmux");

var session = null;
var listener = null;

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

class Person {
    constructor(name) {
        this.name = name;
        this.age = 30;
    }

    Name() {
        return this.name;
    }

    Age() {
        return this.age.toString();
    }

    IncrAge() {
        this.age++;
    }
}

class Service {
    constructor(objs) {
        this.objs = objs;
    }

    NewPerson(name) {
        var obj = this.objs.register(new Person("Jeff"));
        return {"ObjectPath": obj.path()};
    }

    Person(handle) {
        return JSON.stringify(this.objs.object(handle.ObjectPath).value);
    }

    upper(v) {
        return v.toUpperCase();
    }
}

(async () => {
    var api = new qrpc.API();
    var objs = new qrpc.ObjectManager();
    api.handle("demo", qrpc.Export(new Service(objs)));
    objs.mount(api, "objs");
    api.handle("obj", qrpc.Export({
        "lower": function(v) {
            return v.toLowerCase();
        }
    }));

    listener = await libmux.ListenWebsocket("localhost:4242");
    var server = new qrpc.Server();
    console.log("serving...");
    await server.serve(listener, api);

    // console.log("connecting...");
    // session = await libmux.DialTCP("localhost:4242");
    // var client = new qrpc.Client(session, api);
    // //client.serveAPI();
    // console.log("ret: "+await client.call("echo", "Hello world!"));
    // await session.close();
    // await listener.close();
})().catch(async (err) => { 
    console.log(err.stack);
});