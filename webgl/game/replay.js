const { saveAs } = require("file-saver");
const ReplayDB = require("./replay-db");
const CLIPS_PER_PAGE = 20;

module.exports = class ReplayMenu {

    /** @param {import("./hud")} hud */
    constructor(hud) {
        this.hud = hud;
        this.modal = UIkit.modal("#replay-modal");
        this.title = document.getElementById("replay-title");
        this.elem = document.getElementById("replay-list");
        UIkit.util.on("#replay-modal", "beforeshow", () => this.sync());

        this.page = 0;
        this.count = null;
        /** @type {string[]} */
        this.keys = [];
        /** @type {HTMLDivElement[]} */
        this.components = [];
    }

    async init() {
        this.db = await ReplayDB();
        this.registerEvents();
    }

    registerEvents() {
        this.uploadButton = document.getElementById("upload-replay");
        /** @type {HTMLInputElement} */
        const input = this.uploadButton.firstElementChild;
        input.addEventListener("change", async e => {
            /** @type {FileList} */
            const files = e.target.files;
            for (let i = 0; i < files.length; i++) {
                const file = files.item(i);
                try {
                    await this.upload(file);
                    this.hud.onSuccess(`Loaded replay from "${file.name}"`);
                } catch (e) {
                    this.hud.onError(`Failed to load replay from "${file.name}": ${e.message}`);
                }
            }
            await this.sync();
        });
        this.uploadButton.addEventListener("click", () => input.click());
    }

    /** @param {File} file */
    async upload(file) {
        if (file.type != "image/gif") throw new Error("Invalid File Type");
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const packetByteLength = view.getUint32(buffer.byteLength - 4, true);
        const gifBytesLength = buffer.byteLength - packetByteLength - 4;
        if (gifBytesLength > buffer.byteLength) throw new Error("Unexpected Bytes");
        if (String.fromCharCode(view.getUint8(gifBytesLength - 1)) !== ";") throw new Error("Unexpected Bytes");

        await new Promise((resolve, reject) => {
            const id = Date.now();
            const size = buffer.byteLength;
            const thumbnail = new Blob([buffer.slice(0, gifBytesLength)], { type: "image/gif" });
            const replay = buffer.slice(gifBytesLength, buffer.byteLength - 4);
    
            const tx = this.db.transaction(["replay-meta", "replay-data"], "readwrite");
            const metaStore = tx.objectStore("replay-meta");
            const dataStore = tx.objectStore("replay-data");
    
            metaStore.add({ size, thumbnail }, id);
            dataStore.add(replay, id);

            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
    }

    async sync(force = false) {
        const count = await this.countReplays();
        if (force || this.count !== count) {
            this.count = count;
            await this.update();
        }
    }

    async update() {
        if (!this.count) {
            this.title.textContent = "Clips (empty)";
            this.components.forEach(c => c.remove());
            this.components = [];
        } else {
            this.title.textContent = "Clips";

            this.keys = await this.getAllKeys();
            const keysToRender = this.keys.slice(this.page * CLIPS_PER_PAGE, (this.page + 1) * CLIPS_PER_PAGE);

            this.components = this.components.filter(c => {
                if (!keysToRender.some(k => c.getAttribute("replay-id") == k)) {
                    c.remove();
                    return false;
                }
                return true;
            });

            for (const k of keysToRender) {
                if (!this.components.some(c => c.getAttribute("replay-id") == k)) {
                    const comp = this.createReplayComponent(k);
                    const c = this.components.find(c => ~~c.getAttribute("replay-id") < ~~k);
                    c ? this.elem.insertBefore(comp, c) : this.elem.prepend(comp);
                    this.components.push(comp);
                }
            }
        }
    }

    play(id = 0) {
        this.modal.hide();
        this.hud.replay(id);
    }

    async fetch(id = 0, type = "image/gif") {
        const [meta, data] = await Promise.all([this.getReplayMeta(id), this.getReplayData(id)]);
        return new Blob([meta.thumbnail, data, new Uint32Array([data.byteLength]).buffer], { type });
    }

    async delete(id = 0) {
        await new Promise((resolve, reject) => {
            const tx = this.db.transaction(["replay-meta", "replay-data"], "readwrite");
            const metaStore = tx.objectStore("replay-meta");
            const dataStore = tx.objectStore("replay-data");
            metaStore.delete(id);
            dataStore.delete(id);
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });

        this.sync();
    }

    async copy(id = 0) {
        const replayGIF = await this.download(id);
        const clipboardItemInput = new ClipboardItem({ 'image/gif' : replayGIF });
        await navigator.clipboard.write([clipboardItemInput]);
        this.hud.onSuccess("Clip copied to clipboard");
    }

    /** @returns {Promise<ReplayMeta>} */
    getReplayMeta(id = "") {
        return new Promise((resolve, reject) => {
            const objStore = this.db.transaction(["replay-meta"], "readonly").objectStore("replay-meta");
            const req = objStore.get(id);
            req.onsuccess = _ => resolve(req.result);
            req.onerror = reject;
        });
    }

    /** @returns {Promise<ArrayBuffer>} */
    getReplayData(id = "") {
        return new Promise((resolve, reject) => {
            const objStore = this.db.transaction(["replay-data"], "readonly").objectStore("replay-data");
            const req = objStore.get(id);
            req.onsuccess = _ => resolve(req.result);
            req.onerror = reject;
        });
    }

    /** @returns {Promise<string[]>} */
    getAllKeys() {
        return new Promise((resolve, reject) => {
            const objStore = this.db.transaction(["replay-meta"], "readonly").objectStore("replay-meta");
            const req = objStore.getAllKeys();
            req.onsuccess = _ => resolve(req.result.reverse());
            req.onerror = reject;
        });
    }

    /** @returns {Promise<number>} */
    countReplays() {
        return new Promise((resolve, reject) => {
            const objStore = this.db.transaction(["replay-meta"], "readonly").objectStore("replay-meta");
            const req = objStore.count();
            req.onsuccess = _ => resolve(req.result);
            req.onerror = reject;
        });
    }
    
    createReplayComponent(id = 0) {
        const div = document.createElement("div");
        div.classList.add("replay-item", "uk-inline", "uk-width-1-5@l", "uk-width-1-3@m", "uk-width-1-2@s");
        div.setAttribute("replay-id", id);

        this.getReplayMeta(id).then(meta => {
            const img = new Image;
            img.classList.add("replay-thumbnail");
            const url = URL.createObjectURL(meta.thumbnail);
            img.onload = () => URL.revokeObjectURL(url);
            img.src = url;
            div.appendChild(img);
        });

        const div2 = document.createElement("div");
        div2.classList.add("uk-position-center");
        const a = document.createElement("a");

        const trash = document.createElement("a");
        trash.classList.add("uk-position-small", "uk-position-bottom-right", "ogarx-icon");
        trash.setAttribute("uk-icon", "icon: trash; ratio: 1.5");
        trash.setAttribute("uk-tooltip", "Delete Clip");
        trash.addEventListener("click", e => {
            e.stopPropagation();
            this.delete(id)
                .then(() => this.hud.onSuccess("Clip Deleted"));
        });
        
        const download = document.createElement("a");
        download.classList.add("uk-position-small", "uk-position-bottom-left", "ogarx-icon");
        download.setAttribute("uk-icon", "icon: download; ratio: 1.5");
        download.setAttribute("uk-tooltip", "Download Clip");
        download.addEventListener("click", e => {
            e.stopPropagation();
            this.fetch(id)
                .then(blob => saveAs(blob, `ogarx-${id}.gif`))
                .then(() => this.hud.onSuccess("Downloading Clip"));
        });

        const copy = document.createElement("a");
        copy.classList.add("uk-position-small", "uk-position-top-right", "ogarx-icon");
        copy.setAttribute("uk-icon", "icon: copy; ratio: 1.5");
        copy.setAttribute("uk-tooltip", "Copy To Clipboard");
        copy.addEventListener("click", e => {
            e.stopPropagation();
            this.fetch(id)
                .then(blob => {
                    navigator.clipboard.write([new ClipboardItem({ [blob.type] : blob })]);
                    this.hud.onSuccess("Clip Copied");
                });
        });

        a.classList.add("play-icon", "ogarx-icon");
        a.setAttribute("uk-icon", "icon: play; ratio: 3;");
        div.addEventListener("click", () => this.play(id));

        div.appendChild(download);
        div.appendChild(trash);
        // div.appendChild(copy); // Browser doesn't allow copying gif to clipboard bruh
        div.appendChild(div2);
        div2.appendChild(a);
        return div;
    }
}

/** @typedef {{ date: number, thumbnail: Blob, size: number }} ReplayMeta */