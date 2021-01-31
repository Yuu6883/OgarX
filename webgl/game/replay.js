const CLIPS_PER_PAGE = 20;

/** 
 * @param {Promise<ReplayMeta>} metaPromise 
 * @param {(id: number) => void} onPlay
 */
const ReplayComponent = (id = "", metaPromise, onPlay) => {
    const div = document.createElement("div");
    div.classList.add("replay-item", "uk-inline", "uk-width-1-5@l", "uk-width-1-3@m", "uk-width-1-2@s");
    div.setAttribute("replay-id", id);
    metaPromise.then(meta => {
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
    a.classList.add("play-icon");
    a.setAttribute("uk-icon", "icon: play; ratio: 3;");
    div.addEventListener("click", () => onPlay(id));
    div.appendChild(div2);
    div2.appendChild(a);
    return div;
}

module.exports = class ReplayMenu {

    /** @param {import("./hud")} hud */
    constructor(hud) {
        this.hud = hud;
        this.modal = UIkit.modal("#replay-modal");
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

        this.registerEvents();
    }

    registerEvents() {
        
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
            this.elem.innerText = "You don't have any clips";
        } else {
            this.elem.innerText = "";
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
                    const metaPromise = this.getReplayMeta(k);
                    const comp = ReplayComponent(k, metaPromise, this.play.bind(this));
                    const c = this.components.find(c => ~~c.getAttribute("replay-id") < ~~k);
                    if (c) this.elem.insertBefore(comp, c);
                    else this.elem.prepend(comp);
                    this.components.push(comp);
                }
            }
        }
    }

    play(id = 0) {
        this.modal.hide();
        this.hud.replay(id);
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
}

/** @typedef {{ date: number, thumbnail: Blob, size: number }} ReplayMeta */