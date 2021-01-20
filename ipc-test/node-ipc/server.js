const { IPC } = require("node-ipc");

const ipc = new IPC();

ipc.config.id = "server";
ipc.config.retry = 3000;
ipc.config.rawBuffer = true;
ipc.config.silent = true;

const pong = new ArrayBuffer(1);
new Uint8Array(pong)[0] = 69;

const memory = new WebAssembly.Memory({ initial: 200 });

ipc.serve(() => {
    ipc.server.on("connect", socket => {
        console.log("Server received connection");
        ipc.server.emit(socket, pong);
    });

    ipc.server.on("data", (data, socket) => {
        ipc.server.emit(socket, memory.buffer);
    });
});

ipc.server.start();