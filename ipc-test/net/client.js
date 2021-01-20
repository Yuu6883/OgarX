const net = require("net");
const path = require("path");

const pipename = str => process.platform == "win32" ? `\\\\.\\pipe\\${str.replace(/^\//, "").replace(/\//g, "-")}` : str;
const SOCKET_FILE = path.resolve(__dirname, "unix.sock");

const client = net.connect(pipename(SOCKET_FILE));

let count = 0;

const buffer = new ArrayBuffer(10);

client
    .on("connect", err => {
        if (!err) console.log("Connected on client");
        client.write(new Uint8Array(buffer));
    })
    .on("data", b => {
        client.write(new Uint8Array(buffer));
        count++;
    })
    .on("close", () => {
        console.log("Disconnected on client");
    });

setInterval(() => {
    console.log(`Message per second: ${count}`);
    count = 0;
}, 1000);