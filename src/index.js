const fs = require("fs");
const path = require("path");
const CORE_PATH  = path.resolve(__dirname, "..", "public", "static", "wasm", "server.wasm");
const PROTOCOL_PATH = path.resolve(__dirname, "..", "public", "static", "wasm", "ogarx.wasm");
const SSL_FOLDER_PATH = path.resolve(__dirname, "..", "ssl");
const SSL_PATH = path.resolve(SSL_FOLDER_PATH, "options.json");

const Server = require("./network/ws-server");
const OgarXProtocol = require("./network/protocols/ogarx");

const server = new Server(process.env.OGARX_SERVER);
const engine = server.game.engine;

server.setGameMode(process.env.OGARX_MODE || "default");

process.on("SIGINT", async () => {
    engine.stop();
    await server.close();
    process.exit(0);
});

let sslOptions = null;
if (!fs.existsSync(SSL_FOLDER_PATH)) fs.mkdirSync(SSL_FOLDER_PATH);
if (fs.existsSync(SSL_PATH)) sslOptions = require(SSL_PATH);

(async () => {
    await engine.init(fs.readFileSync(CORE_PATH));
    await OgarXProtocol.init(fs.readFileSync(PROTOCOL_PATH));

    const opened = await server.open({ 
        sslOptions, 
        port: process.env.OGARX_PORT, 
        endpoint: process.env.OGARX_ENDPOINT });

    if (!opened) process.exit(1);
    engine.start();

    // setInterval(() => {
    //     console.log(`Load: ${~~(engine.usage * 100)} %, collisions: ${engine.collisions}`);
    // }, 1000);
})();
