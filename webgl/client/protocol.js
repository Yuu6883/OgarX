const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");
const FakeSocket = require("./fake-socket");

module.exports = class Protocol {
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        this.pid = 0;
        this.bandwidth = 0;
        this.renderer = renderer;
        
        this.pingInterval = self.setInterval(() => {

            const PING = new ArrayBuffer(1);
            new Uint8Array(PING)[0] = 69;
            this.send(PING);

            // console.log(`Bandwidth: ${~~(this.bandwidth / 1024)}kb/s`);
            this.bandwidth = 0;
        }, 1000);

        const state = this.renderer.state;

        this.mouseInterval = self.setInterval(() => {
            const writer = new Writer();
            writer.writeUInt8(3);
            writer.writeFloat32(this.renderer.cursor.position[0]);
            writer.writeFloat32(this.renderer.cursor.position[1]);

            const currState = state.exchange();

            writer.writeUInt8(currState.spectate);
            writer.writeUInt8(currState.splits);
            writer.writeUInt8(currState.ejects);
            writer.writeUInt8(currState.macro);

            this.send(writer.finalize());

            if (currState.respawn) this.spawn();
        }, 1000 / 30); // TODO?
    }

    connect(urlOrPort) {
        this.disconnect();

        this.ws = typeof urlOrPort == "string" ? new WebSocket(urlOrPort) : new FakeSocket(urlOrPort);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            console.log("Connected to server");
            const writer = new Writer();
            writer.writeUInt8(69);
            writer.writeInt16(420);
            this.ws.send(writer.finalize());
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
                    console.log(`PID: ${this.pid}, MAP: [${map.width}, ${map.height}]`);
                    const rando = this.renderer.randomPlayer();
                    this.spawn(rando.name, rando.skin);
                    break;
                case 2:
                    console.log("Clear map");
                    this.renderer.clearCells();
                    break;
                case 3:
                    const id = reader.readUInt16();
                    const name = reader.readUTF16String();
                    const skin = reader.readUTF16String();
                    console.log(`Received player data`, { id, name, skin });
                    this.renderer.loadPlayerData({ id, name, skin });
                    break;
                case 4:
                    this.parseCellData(e.data);
                    break;
            }
        }
        this.ws.onerror = e => console.error(e);
        this.ws.onclose = e => console.error(e.code, e.reason);
    }

    send(data) {
        if (this.ws && this.ws.readyState == WebSocket.OPEN)
            this.ws.send(data);
    }

    /** @param {ArrayBuffer} buffer */
    parseCellData(buffer) {
        this.lastPacket = Date.now();

        const core = this.renderer.core;
        const viewport = new DataView(buffer, 1, 8);
        
        this.renderer.target.position[0] = viewport.getFloat32(0, true);
        this.renderer.target.position[1] = viewport.getFloat32(4, true);
        // console.log(`Received packet: ${buffer.byteLength} bytes, viewport: { x: ${view_x}, y: ${view_y} }`);
        core.HEAPU8.set(new Uint8Array(buffer, 9), this.renderer.cellTypesTableOffset);                 
        core.instance.exports.deserialize(0, this.renderer.cellTypesTableOffset);
    }

    disconnect() {
        if (this.ws) this.ws.close();
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
}