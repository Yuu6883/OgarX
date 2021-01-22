module.exports = class Skins {
    /** @param {import("./hud")} hud */
    constructor(hud) {
        this.hud = hud;

        let urls;
        try {
            /** @type {string[]} */
            urls = JSON.parse(localStorage.getItem("ogarx-skins"));
            if (!Array.isArray(urls) || !urls.every(s => typeof s === "string"))
                throw new Error("Failed to load skin");
        } catch (e) {
            console.error(e);
            urls = [];
        }

        const oldSkin = localStorage.getItem("ogarx_skin");
        if (oldSkin) {
            localStorage.removeItem("ogarx_skin");
            urls.push(oldSkin);
        } else if (!urls.length) urls.push("");

        let index = Math.min(~~localStorage.getItem("ogarx-skin-index") || 0, urls.length - 1);
        this.listElem = document.getElementById("skins");

        document.getElementById("prev-skin").addEventListener("click", () => this.prev());
        document.getElementById("next-skin").addEventListener("click", () => this.next());

        /** @type {HTMLImageElement} */
        this.selectedImg = null;
        /** @type {HTMLImageElement[]} */
        this.elems = [];

        for (const i in urls) {
            const div = document.createElement("div");
            div.classList.add("skin-item");
            const img = document.createElement("img");
            this.initImg(img);
            div.appendChild(img);
            img.onerror = () => img.src = "/static/img/skin.png";
            img.src = urls[i];
            this.listElem.appendChild(div);
            this.elems.push(img);
        }

        this.selectedImg = this.elems[index];
        this.selectedImg.classList.add("selected");
        this.selectedImg.addEventListener("load", () => this.sync(), { once: true });

        document.getElementById("add-skin").addEventListener("click", () => this.addSlot());
        document.getElementById("delete-skin").addEventListener("click", () => this.delete());

        this.save();
    }

    /** @param {HTMLImageElement} img */
    initImg(img) {
        img.onclick = () => {
            if (img.classList.contains("selected")) return;
            this.selectedImg.classList.remove("selected");
            img.classList.add("selected");
            this.selectedImg = img;
            this.sync();
            this.saveIndex();
        }
    }

    addSlot() {
        const div = document.createElement("div");
        div.classList.add("skin-item");
        const img = document.createElement("img");
        this.initImg(img);
        div.appendChild(img);
        this.listElem.appendChild(div);
        img.src = "/static/img/skin.png";
        this.elems.push(img);
        this.save();
    }

    delete() {
        if (this.elems.length === 1) {
            this.selectedImg.src = "/static/img/skin.png";
            this.sync();
            this.save();
            return;
        }

        const currentIndex = this.index;
        this.selectedImg.parentNode.remove();
        this.elems.splice(currentIndex, 1);
        if (this.elems[currentIndex]) {
            this.elems[currentIndex].click();
            this.save();
        } else {
            this.elems[currentIndex - 1].click();
            this.save();
        }
    }

    get index() {
        return this.elems.indexOf(this.selectedImg);
    }

    set current(v) {
        if (this.current != v) {
            this.selectedImg.src = v;
            this.save();
        }
    }

    get current() {
        return this.getUrl(this.selectedImg.src); 
    }

    getUrl(s) { return s.endsWith("/static/img/skin.png") ? "" : s; }

    prev() {
        if (this.elems.length <= 1) return;
        this.elems[(this.index - 1 + this.elems.length) % this.elems.length].click();
        this.sync();
        this.saveIndex();
    }

    next() {
        if (this.elems.length <= 1) return;
        this.elems[(this.index + 1) % this.elems.length].click();
        this.sync();
        this.saveIndex();
    }

    sync() {
        if (this.hud.skin != this.current) {
            this.hud.skinInput.value = this.current;
            this.hud.updateSkin();
        }
    }

    saveIndex() {
        localStorage.setItem("ogarx-skin-index", this.index);
    }

    save() {
        this.saveIndex();
        localStorage.setItem("ogarx-skins", JSON.stringify(this.elems.map(e => this.getUrl(e.src))));
    }
}