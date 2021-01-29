const { EventEmitter } = require("events");
const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");
const FakeSocket = require("./fake-socket");

const uuidv4 = () => ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

class ReplaySnapshot {
    constructor(length = 0) {
        this.score = 0;
        this.state = new ArrayBuffer(length);
        this.view = new Uint8Array(this.state);

        /** @type {number[]} */
        this.packetTimestamps = [];
        /** @type {ArrayBuffer[]} */
        this.packets = [];
        /** @type {[number, { name: string, skin: string }][]} */
        this.players = [];
    }
}

const REPLAY_LENGTH = 10;

class ReplaySystem {
    /**
     * @param {import("./renderer")} renderer
     * @param {number} length 
     */
    constructor(renderer, length) {        
        this.encoder = new OffscreenCanvas(0, 0);
        this.encoderCTX = this.encoder.getContext("bitmaprenderer");

        this.thumbnail = new ArrayBuffer(0); // Placeholder
        this.thumbnailUint8View = new Uint8Array(this.thumbnail);
        this.thumbnailUint8ClampedView = new Uint8ClampedArray(this.thumbnail);

        this.renderer = renderer;
        // 2.6mb view
        this.source = new Uint8Array(renderer.core.buffer, 0, renderer.cellDataBufferLength);
        this.snapshots = Array.from({ length }, _ => new ReplaySnapshot(this.source.byteLength));
    }

    async init() {
        /** @type {IDBDatabase} */
        this.db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("ogar69-replay");
            req.onupgradeneeded = e => {
                console.log("Creating replay object store");
                /** @type {IDBDatabase} */
                const db = e.target.result;
                db.createObjectStore("replay-meta");
                db.createObjectStore("replay-data");
            }
            req.onsuccess = _ => resolve(req.result);
            req.onerror = reject;
        });
        console.log("Connected to replay database");
    }

    resizeBuffer() {
        if (this.renderer.RGBABytes > this.thumbnail.byteLength) {
            this.thumbnail = new ArrayBuffer(this.renderer.RGBABytes);
            this.thumbnailUint8View = new Uint8Array(this.thumbnail);
            this.thumbnailUint8ClampedView = new Uint8ClampedArray(this.thumbnail);
            this.thumbnailData = new ImageData(new Uint8ClampedArray(this.thumbnail), 
                this.renderer.gl.drawingBufferWidth, this.renderer.gl.drawingBufferHeight);
        }
    }

    async save() {
        await new Promise(async (resolve, reject) => {
            const snapshots = this.snapshots.filter(s => s.packets.length).map(s => s);
            /** @type {ArrayBuffer[]} */
            const buffers = snapshots.reduceRight((prev, curr) => prev.concat(curr.packets), []);
            /** @type {number[]} */
            let timestamps = snapshots.reduceRight((prev, curr) => prev.concat(curr.packetTimestamps), []);
            const minTimestamp = Math.min(...timestamps);
            timestamps = timestamps.map(t => t - minTimestamp);

            const initial = snapshots[snapshots.length - 1].state;

            console.log(this.thumbnailData.width, this.thumbnailData.height);
            this.encoder.width = this.thumbnailData.width >> 2;
            this.encoder.height = this.thumbnailData.height >> 2;
            this.encoderCTX.transferFromImageBitmap(await createImageBitmap(this.thumbnailData, {
                imageOrientation: "flipY", 
                resizeWidth: this.encoder.width, 
                resizeHeight: this.encoder.height,
                resizeQuality: "high"
            }));
            const blob = await this.encoder.convertToBlob({ type: "image/jpeg", quality: 1 });

            const tx = this.db.transaction(["replay-meta", "replay-data"], "readwrite");
            const metaStore = tx.objectStore("replay-meta");
            const dataStore = tx.objectStore("replay-data");
            const uid = uuidv4();

            metaStore.add({
                date: Date.now(),
                thumbnail: blob,
                size: initial.byteLength + blob.size + buffers.reduce((prev, curr) => prev + curr.byteLength, 0),
            }, uid);

            dataStore.add({ initial, buffers, timestamps }, uid);

            tx.oncomplete = () => {
                self.postMessage({ event: "replay" });
                resolve()
            };
            tx.onerror = reject;
        });
    }

    set score(v) {
        if (v > this.maxScore) {
            this.resizeBuffer();
            this.renderer.screenshot(this.thumbnailUint8View);
        }
        this.snapshots[0].score = Math.max(v, this.snapshots[0].score);
    }

    get maxScore() { return Math.max(...this.snapshots.map(s => s.score)); }

    // Record current state
    recordState() {
        const tail = this.snapshots.pop();
        this.free(tail);
        this.snapshots.unshift(tail);
        tail.view.set(this.source);
        tail.players = [...this.renderer.playerData.entries()];
        
        this.score = this.renderer.stats.score;
    }

    /** @param {ArrayBuffer} packet */
    recordPacket(packet, time = performance.now()) {
        this.snapshots[0].packets.push(packet);
        this.snapshots[0].packetTimestamps.push(time);
    }

    /** @param {ReplaySnapshot} snapshot */
    free(snapshot) {
        this.renderer.loader.postMessage(snapshot.packets, snapshot.packets);
        snapshot.score = 0;
        snapshot.view.fill(0);
        snapshot.packets = [];
        snapshot.players = [];
    }

    reset() {
        this.snapshots.forEach(s => this.free(s));
    }
}

const RecordOPs = [2, 3, 4];

module.exports = class Protocol extends EventEmitter {
    
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        super();
        this.pid = 0;
        this.bandwidth = 0;
        this.renderer = renderer;
        this.replay = new ReplaySystem(renderer, REPLAY_LENGTH);
        
        this.pingInterval = self.setInterval(() => {

            this.renderer.stats.bandwidth = this.bandwidth;
            this.bandwidth = 0;
            
            if (!this.pid || this.ping) return;
            
            const PING = new ArrayBuffer(1);
            new Uint8Array(PING)[0] = 69;
            this.send(PING);
            this.ping = Date.now();

            this.replay.recordState();
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
            if (currState.clip) this.replay.save();
        }, 1000 / 33); // TODO?
    }

    connect(urlOrPort, name = "", skin = "") {

        const oldWs = this.ws;

        const currWs = this.ws = typeof urlOrPort == "string" ? new WebSocket(urlOrPort) : new FakeSocket(urlOrPort);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            const writer = new Writer();
            writer.writeUInt8(69);
            writer.writeInt16(420);
            writer.writeUTF16String(name);
            writer.writeUTF16String(skin);
            this.ws.send(writer.finalize());
            this.emit("open");

            delete this.ping;
        }

        /** @param {{ data: ArrayBuffer }} e */
        this.ws.onmessage = e => {
            const reader = new Reader(new DataView(e.data));
            const OP = reader.readUInt8();
            this.bandwidth += e.data.byteLength;
            
            if (RecordOPs.includes(OP)) this.replay.recordPacket(e.data);

            switch (OP) {
                case 1:
                    this.pid = reader.readUInt16();
                    this.map = { 
                        hw: reader.readUInt16(), 
                        hh: reader.readUInt16()
                    };
                    console.log(`Map Dimension: ${this.map.hw << 1}x${this.map.hh << 1}`);
                    const server = reader.readUTF16String();
                    this.emit("protocol");
                    self.postMessage({ event: "connect", server });
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
                    this.parseLeaderboard(reader);
                    break;
                // Minimap
                case 6:
                    this.parseMinimap(reader);
                    break;
                // Stats
                case 7:
                    this.parseStats(reader);
                    if (this.renderer.state.auto_respawn) {
                        const RESPAWN = new ArrayBuffer(1);
                        new Uint8Array(RESPAWN)[0] = 7;
                        this.send(RESPAWN);
                    }
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

        this.ws.onerror = e => self.postMessage({
            event: "error",
            message: "Connection failed"
        });

        this.ws.onclose = e => {
            delete this.ping;
            this.emit("close");
            
            this.renderer.clearCells();
            this.renderer.clearData();
            this.renderer.clear();

            this.map = null;
            this.bandwidth = 0;
            this.renderer.stats.linelocked = 0;
            this.renderer.stats.mycells = 0;
            this.renderer.stats.ping = 0;

            if (this.ws == currWs) self.postMessage({ 
                event: "disconnect", code: e.code, reason: e.reason });
        }

        oldWs && oldWs.close();
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
        const header = new DataView(buffer, 1, 14);

        this.renderer.stats.mycells = header.getUint8(0);
        this.renderer.stats.linelocked = header.getUint8(1);
        this.renderer.stats.score = header.getFloat32(2, true);
        this.renderer.target.position[0] = header.getFloat32(6, true);
        this.renderer.target.position[1] = header.getFloat32(10, true);
        
        core.HEAPU8.set(new Uint8Array(buffer, 15), this.renderer.cellTypesTableOffset);                 
        core.instance.exports.deserialize(0, this.renderer.cellTypesTableOffset);
    }

    /** @param {Reader} reader */
    parseLeaderboard(reader) {
        const rank = reader.readInt16();
        const count = reader.readUInt8();
        const lb = { rank, me: this.me, players: [] }
        for (let i = 0; i < count; i++) lb.players.push(
            this.renderer.playerData.get(reader.readUInt8()));
        self.postMessage({ event: "leaderboard", lb });
    }

    /** @param {Reader} reader */
    parseMinimap(reader) {
        const count = reader.readUInt8();
        const minimap = [];
        for (let i = 0; i < count; i++) {
            const pid = reader.readUInt8();
            const player = this.renderer.playerData.get(pid) || {};
            player.id = pid;
            if (pid == this.pid) player.me = true;
            const x = reader.readFloat32(), y = reader.readFloat32();
            player.x = x / (this.map.hw << 1) + 0.5;
            player.y = y / (this.map.hh << 1) + 0.5;
            player.score = reader.readFloat32();
            minimap.push(player);
        }
        self.postMessage({ event: "minimap", minimap });
    }

    /** @param {Reader} reader */
    parseStats(reader) {
        const kills = reader.readUInt32();
        const score = reader.readFloat32();
        const surviveTime = reader.readFloat32();
        self.postMessage({ event: "stats", kills, score, surviveTime });
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