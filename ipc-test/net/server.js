const { existsSync, unlinkSync } = require("fs");
const net = require("net");
const path = require("path");

const pipename = str => process.platform == "win32" ? `\\\\.\\pipe\\${str.replace(/^\//, "").replace(/\//g, "-")}` : str;
const SOCKET_FILE = path.resolve(__dirname, "unix.sock");

if (existsSync(SOCKET_FILE)) unlinkSync(SOCKET_FILE);

const memory = new WebAssembly.Memory({ initial: 200 });
const view = new Uint8Array(memory.buffer);

const server = net.createServer();

server.on("connection", sock => {
    console.log("Connection established");
    sock
        .on("data", buffer => {
            sock.write(view);
        })
        .on("error", () => console.log("Connection errored"))
        .on("end", err => console.log(`Connection ended`));
});

server.listen(pipename(SOCKET_FILE));