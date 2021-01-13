const { EventEmitter } = require("events");
const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");
const FakeSocket = require("./fake-socket");

module.exports = class Protocol extends EventEmitter {
    
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        super();
        this.pid = 0;
        this.bandwidth = 0;
        this.renderer = renderer;
        
        this.pingInterval = self.setInterval(() => {

            if (!this.pid || this.ping) return;
            
            const PING = new ArrayBuffer(1);
            new Uint8Array(PING)[0] = 69;
            this.send(PING);
            this.ping = Date.now();

            this.renderer.stats.bandwidth = this.bandwidth;
            this.bandwidth = 0;
        }, 1000);

        const state = this.renderer.state;

        this.mouseInterval = self.setInterval(() => {

            if (!this.pid) return;

            const writer = new Writer();
            writer.writeUInt8(3);
            writer.writeFloat32(this.renderer.cursor.position[0]);
            writer.writeFloat32(this.renderer.cursor.position[1]);

            const currState = state.exchange();

            writer.writeUInt8(currState.spectate);
            writer.writeUInt8(currState.splits);
            writer.writeUInt8(currState.ejects);
            writer.writeUInt8(currState.macro);
            writer.writeUInt8(currState.lineLock);

            this.send(writer.finalize());

            if (currState.respawn) this.spawn();
        }, 1000 / 30); // TODO?
    }

    connect(urlOrPort, name = "", skin = "") {
        this.disconnect();

        this.ws = typeof urlOrPort == "string" ? new WebSocket(urlOrPort) : new FakeSocket(urlOrPort);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            console.log("Connected to server");
            const writer = new Writer();
            writer.writeUInt8(69);
            writer.writeInt16(420);
            writer.writeUTF16String(name);
            writer.writeUTF16String(skin);
            this.ws.send(writer.finalize());
            this.emit("open");
        }

        /** @param {{ data: ArrayBuffer }} e */
        this.ws.onmessage = e => {
            const reader = new Reader(new DataView(e.data));
            const OP = reader.readUInt8();
            this.bandwidth += e.data.byteLength;
            switch (OP) {
                case 1:
                    this.pid = reader.readUInt16();
                    const map = { 
                        width: 2 * reader.readUInt16(), 
                        height: 2 * reader.readUInt16()
                    };
                    this.emit("protocol");
                    self.postMessage({ event: "connect" });
                    break;
                case 2:
                    this.renderer.clearCells();
                    break;
                case 3:
                    const id = reader.readUInt16();
                    const name = reader.readUTF16String();
                    const skin = reader.readUTF16String();
                    this.renderer.loadPlayerData({ id, name, skin });
                    break;
                case 4:
                    this.parseCellData(e.data);
                    break;
                // Leaderboard
                case 5:
                    const rank = reader.readInt16();
                    const count = reader.readUInt8();
                    const lb = { rank, me: this.me, players: [] }
                    for (let i = 0; i < count; i++) lb.players.push(
                        this.renderer.playerData.get(reader.readUInt8()));
                    self.postMessage({ event: "leaderboard", lb });
                    break;
                // Chat
                case 10:
                    const pid = reader.readUInt16();
                    const message = reader.readUTF16String();
                    const player = this.renderer.playerData.get(pid);
                    if (!player) return console.warn(`Received unknown pid: ${pid}, message: ${message}`);
                    self.postMessage({ event: "chat", pid, player, message });
                    break;
                // PONG
                case 69:
                    if (!this.ping) return;
                    this.renderer.stats.ping = Date.now() - this.ping;
                    delete this.ping;
                    break;
            }
        }
        this.ws.onerror = e => console.error(e);
        this.ws.onclose = e => {
            this.emit("close");
            this.renderer.clearCells();
            this.renderer.clearData();
            console.error(`Socket closed: { code: ${e.code}, reason: ${e.reason} }`);
            self.postMessage({ event: "disconnect" });
        }
    }

    get me() { return this.renderer.playerData.get(this.pid) || {}; }

    get connecting() { return this.ws && this.ws.readyState == WebSocket.CONNECTING; }
    get connected() { return this.ws && this.ws.readyState == WebSocket.OPEN; }

    send(data) {
        this.connected && this.ws.send(data);
    }

    /** @param {ArrayBuffer} buffer */
    parseCellData(buffer) {
        this.lastPacket = Date.now();

        const core = this.renderer.core;
        const viewport = new DataView(buffer, 1, 8);
        
        this.renderer.target.position[0] = viewport.getFloat32(0, true);
        this.renderer.target.position[1] = viewport.getFloat32(4, true);
        
        core.HEAPU8.set(new Uint8Array(buffer, 9), this.renderer.cellTypesTableOffset);                 
        core.instance.exports.deserialize(0, this.renderer.cellTypesTableOffset);
    }

    disconnect() {
        if (!this.ws) return;

        console.log("Disconnecting on client");
        this.ws.close();
        this.ws = null;
    }

    /**
     * @param {string} name 
     * @param {string} skin 
     */
    spawn(name = this.lastName, skin = this.lastSkin) {
        this.lastName = name;
        this.lastSkin = skin;

        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUTF16String(name);
        writer.writeUTF16String(skin);
        this.send(writer.finalize());
    }

    get player() {
        return this.renderer.playerData.get(this.pid);
    }

    sendChat(message) {
        const writer = new Writer();
        writer.writeUInt8(10);
        writer.writeUTF16String(message);
        this.send(writer.finalize());

        if (this.pid) {
            self.postMessage({ event: "chat", pid: this.pid, player: this.player, message });
        }
    }
}