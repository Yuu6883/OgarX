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

        const index1 = Math.min(~~localStorage.getItem("ogarx-skin-index-1") || 0, urls.length - 1);
        const index2 = Math.min(~~localStorage.getItem("ogarx-skin-index-2") || 0, urls.length - 1);

        this.listElem = document.getElementById("skins");

        document.getElementById("prev-skin").addEventListener("click", () => this.prev());
        document.getElementById("next-skin").addEventListener("click", () => this.next());

        /** @type {HTMLImageElement} */
        this.selectedImg1 = null;
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

        this.selectedImg1 = this.elems[index1];
        this.selectedImg1.classList.add("selected-1");
        this.selectedImg1.addEventListener("load", () => this.sync(), { once: true });

        this.selectedImg2 = this.elems[index2];
        this.selectedImg2.classList.add("selected-2");
        this.selectedImg2.addEventListener("load", () => this.sync(), { once: true });

        document.getElementById("add-skin").addEventListener("click", () => this.addSlot());
        document.getElementById("delete-skin").addEventListener("click", () => this.delete());

        this.save();
    }

    /** @param {HTMLImageElement} img */
    initImg(img) {
        img.onmouseup = e => this.select(img, [0, null, 1][e.button]);
    }

    /** @param {HTMLImageElement} img */
    select(img, index = 0) {
        if (!(index === 0) && !(index === 1)) return;
        const elemName = `selectedImg${index + 1}`;
        const className = `selected-${index + 1}`;
        if (img.classList.contains(className)) return;
        this[elemName].classList.remove(className);
        img.classList.add(className);
        this[elemName] = img;
        this.sync();
        this.saveIndex();
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

    swap() {
        const img1 = this.selectedImg1;
        const img2 = this.selectedImg2;
        this.select(img1, 1);
        this.select(img2, 0);
        this.sync();
        this.saveIndex();
    }

    delete(index = 0) {
        if (this.elems.length === 1) {
            this.selectedImg1.src = "/static/img/skin.png";
            this.sync();
            this.save();
            return;
        }

        const index1 = this.index1;
        const index2 = this.index2;

        const currentIndex = this[`index${index + 1}`];
        const elemName = `selectedImg${index + 1}`;
        this[elemName].parentNode.remove();
        this.elems.splice(currentIndex, 1);

        if (this.elems[currentIndex]) {
            this.select(this.elems[currentIndex], index);
            this.save();
        }

        if (!this.elems[index1]) {
            this.select(this.elems[index1 - 1], 0);
            this.save();
        }

        if (!this.elems[index2]) {
            this.select(this.elems[index2 - 1], 1);
            this.save();
        }
    }

    get index1() { return this.elems.indexOf(this.selectedImg1); }
    get index2() { return this.elems.indexOf(this.selectedImg2); }

    set current1(v) {
        if (this.current[0] != v) {
            this.selectedImg1.src = v;
            this.save();
        }
    }

    set current2(v) {
        if (this.current[1] != v) {
            this.selectedImg2.src = v;
            this.save();
        }
    }

    get current() {
        return [
            this.getUrl(this.selectedImg1.src),
            this.getUrl(this.selectedImg2.src)
        ]; 
    }

    getUrl(s) { return s.endsWith("/static/img/skin.png") ? "" : s; }

    prev(index = 0) {
        if (this.elems.length <= 1) return;
        this.select(this.elems[(this[`index${index + 1}`] - 1 + this.elems.length) % this.elems.length], index);
        this.sync();
        this.saveIndex();
    }

    next(index = 0) {
        if (this.elems.length <= 1) return;
        this.select(this.elems[(this[`index${index + 1}`] + 1) % this.elems.length], index);
        this.sync();
        this.saveIndex();
    }

    sync() {
        const [skin1, skin2] = this.current;
        this.hud.updateSkin(skin1, 0);
        this.hud.updateSkin(skin2, 1);
    }

    saveIndex() {
        localStorage.setItem("ogarx-skin-index-1", this.index1);
        localStorage.setItem("ogarx-skin-index-2", this.index2);
    }

    save() {
        this.saveIndex();
        localStorage.setItem("ogarx-skins", JSON.stringify(this.elems.map(e => this.getUrl(e.src))));
    }
}