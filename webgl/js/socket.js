const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");
const PING = new Uint8Array([69]);

module.exports = class GameSocket {
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        this.pid = 0;
        this.renderer = renderer;
        
        this.pingInterval = self.setInterval(() => {
            this.send(PING);
        }, 1000);

        this.mouseInterval = self.setInterval(() => {
            const writer = new Writer();
            writer.writeUInt8(3);
            writer.writeFloat32(this.renderer.cursor.position[0]);
            writer.writeFloat32(this.renderer.cursor.position[1]);
            this.send(writer.finalize());
        }, 1000 / 25); // TODO?
    }

    connect(url = "") {
        this.disconnect();

        this.ws = new WebSocket(url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            console.log("Connected");
            const writer = new Writer();
            writer.writeUInt8(69);
            writer.writeInt16(420);
            this.ws.send(writer.finalize());
        }
        /** @param {{ data: ArrayBuffer }} e */
        this.ws.onmessage = e => {
            const reader = new Reader(new DataView(e.data));
            const OP = reader.readUInt8();

            switch (OP) {
                case 1:
                    this.pid = reader.readUInt16();
                    const map = { 
                        width: 2 * reader.readUInt16(), 
                        height: 2 * reader.readUInt16()
                    };
                    console.log(`PID: ${this.pid}, MAP: [${map.width}, ${map.height}]`);
                    this.spawn("Yuu", "https://skins.vanis.io/s/GljCi6");
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
        
        // self.log = true;
        // this.renderer.printCells();
    }

    disconnect() {
        if (this.ws) this.ws.close();
        this.ws = null;
    }

    /**
     * @param {string} name 
     * @param {string} skin 
     */
    spawn(name, skin) {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUTF16String(name);
        writer.writeUTF16String(skin);
        this.send(writer.finalize());
    }
}