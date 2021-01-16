const fs = require("fs");
const path = require("path");
const CORE_PATH  = path.resolve(__dirname, "..", "public", "static", "wasm", "server.wasm");
const OGARX_PATH = path.resolve(__dirname, "..", "public", "static", "wasm", "ogarx.wasm");
const SSL_FOLDER_PATH = path.resolve(__dirname, "..", "ssl");
const SSL_PATH = path.resolve(SSL_FOLDER_PATH, "options.json");

const Server = require("./network/ws-server");
const OgarXProtocol = require("./network/protocols/ogarx");

const server = new Server();
const engine = server.game.engine;

engine.setOptions({
    TIME_SCALE: 1.2, // magic that make everything work like a certain ball game
    // PHYSICS_TPS: 4,
    PLAYER_MAX_CELLS: 128,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_MERGE_TIME: 4,
    VIRUS_COUNT: 250,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 38,
    EJECT_LOSS: 38.4,
    EJECT_DELAY: 50,
    BOTS: 70,
    PELLET_COUNT: 5000,
    PLAYER_SPAWN_SIZE: 1500,
    MAP_HW: 30000,
    MAP_HH: 30000
});

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
    await OgarXProtocol.init(fs.readFileSync(OGARX_PATH));
    await server.open(sslOptions, process.env.PORT);
    engine.start();

    // setInterval(() => {
    //     console.log(`Load: ${~~(engine.usage * 100)} %, collisions: ${engine.collisions}`);
    // }, 1000);
})();
