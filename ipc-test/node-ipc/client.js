const { IPC } = require("node-ipc");

const ipc = new IPC();

ipc.config.id = `client#${Date.now()}`;
ipc.config.retry = 3000;
ipc.config.rawBuffer = true;
ipc.config.silent = true;

let count = 0;

const buffer = new ArrayBuffer(10);

ipc.connectTo("server", () => {
    ipc.of.server.on("connect", () => {
        console.log("Client connected");
        ipc.of.server.emit(buffer);
    });

    ipc.of.server.on("data", data => {
        ipc.of.server.emit(buffer);
        count++;
    });
});

setInterval(() => {
    console.log(`Message per second: ${count}`);
    count = 0;
}, 1000);