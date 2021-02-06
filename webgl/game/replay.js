const { saveAs } = require("file-saver");
const ReplayDB = require("./replay-db");
const CLIPS_PER_PAGE = 15;

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

        this.prevButton = document.querySelector("#prev-clip");
        this.prevButton.addEventListener("click", () => this.prevPage());
        this.nextButton = document.querySelector("#next-clip");
        this.nextButton.addEventListener("click", () => this.nextPage());
    }

    get canGoPrev() { return this.page > 0; }
    get canGoNext() { return this.page < Math.ceil(this.count / CLIPS_PER_PAGE) - 1; }
    get isOverPage() { return this.page >= Math.ceil(this.count / CLIPS_PER_PAGE) && (this.page > 0); }

    updateButtons() {
        if (this.canGoPrev) this.prevButton.classList.remove("disabled");
        else this.prevButton.classList.add("disabled");
        if (this.canGoNext) this.nextButton.classList.remove("disabled");
        else this.nextButton.classList.add("disabled");
    }

    prevPage() {
        if (!this.canGoPrev) return;
        this.page--;
        return this.sync(true);
    }

    nextPage() {
        if (!this.canGoNext) return;
        this.page++;
        return this.sync(true);
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
            if (this.isOverPage) return await this.prevPage();
            await this.update();
        }
        this.updateButtons();
    }

    async update() {
        if (!this.count) {
            this.title.textContent = "Clips (empty)";
            this.components.forEach(c => c.remove());
            this.components = [];
        } else {
            this.title.textContent = "Clips";

            // Descending, from latest to oldest
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
                    c ? this.elem.insertBefore(comp, c) : this.elem.appendChild(comp);
                    this.components.unshift(comp);
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
        div.classList.add("replay-item", "uk-inline", "uk-width-1-5@l", "uk-width-1-3@m", "uk-width-1-1@s");
        div.setAttribute("replay-id", id);

        this.getReplayMeta(id).then(meta => {
            const img = new Image;
            img.classList.add("replay-thumbnail");
            const url = URL.createObjectURL(meta.thumbnail);
            img.onload = () => URL.revokeObjectURL(url);
            img.src = url;
            div.appendChild(img);
        });

        const playContainer = document.createElement("div");
        playContainer.classList.add("uk-position-center");
        const playIcon = document.createElement("a");

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

        // Browser doesn't allow copying gif to clipboard bruh
        // const copy = document.createElement("a");
        // copy.classList.add("uk-position-small", "uk-position-top-right", "ogarx-icon");
        // copy.setAttribute("uk-icon", "icon: copy; ratio: 1.5");
        // copy.setAttribute("uk-tooltip", "Copy To Clipboard");
        // copy.addEventListener("click", e => {
        //     e.stopPropagation();
        //     this.fetch(id)
        //         .then(blob => {
        //             navigator.clipboard.write([new ClipboardItem({ [blob.type] : blob })]);
        //             this.hud.onSuccess("Clip Copied");
        //         });
        // });

        playIcon.classList.add("play-icon", "ogarx-icon");
        playIcon.setAttribute("uk-icon", "icon: play; ratio: 3;");
        playIcon.addEventListener("click", () => this.play(id));
        playContainer.appendChild(playIcon);

        const overlays = [download, trash, playContainer];

        overlays.forEach(e => e.style.opacity = 0);
        overlays.forEach(e => div.appendChild(e));

        div.addEventListener("mouseenter", () => overlays.forEach(e => e.style.opacity = 1));
        div.addEventListener("mouseleave", () => overlays.forEach(e => e.style.opacity = 0));

        return div;
    }
}

/** @typedef {{ date: number, thumbnail: Blob, size: number }} ReplayMeta */