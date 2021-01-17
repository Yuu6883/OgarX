const events = ["Feed", "Split", "Double Split", "Triple Split", "Quad Split", "Line Lock", "Respawn"];

const KeyNameMap = { " ": "SPACE" };

module.exports = class Keyboard {
    /** @param {import("./hud")} hud */
    constructor(hud) {
        this.hud = hud;

        try {
            /** @type {string[]} */
            const keys = JSON.parse(localStorage.getItem("ogarx-keys"));
            if (!Array.isArray(keys) || keys.length != events.length || 
                !keys.every(k => typeof k == "string"))
                throw new Error("Error parsing keybinds, resetting");
            this.keys = keys;
        } catch (e) {
            console.error(e);
            this.keys = ["w", " ", "g", "z", "q", "f", "n"];
        }

        this.menuElem = document.getElementById("key-menu");

        /** @type {Set<string>} */
        this.pressing = new Set();

        this.updateKeys();
        this.save();
    }

    save() {
        localStorage.setItem("ogarx-keys", JSON.stringify(this.keys));
    }

    updateKeys() {
        const keys = document.getElementById("keys");
        keys.innerHTML = "";

        this.labels = [];

        for (const i in events) {
            const label = document.createElement("span");
            const k = this.keys[i].toUpperCase();
            label.textContent = `${events[i]}`;
            const b = document.createElement("b");
            b.innerText = (KeyNameMap[k] || k).toUpperCase();
            b.classList.add("selectable");
            keys.appendChild(label);
            keys.appendChild(b);
            this.labels.push(b);

            b.addEventListener("mouseenter", _ => {
                this.hovered = b;
            });

            b.addEventListener("mouseleave", _ => {
                this.hovered = null;
            });

            b.addEventListener("click", e => {
                this.setKey(b, `MOUSE ${e.button}`);
                e.preventDefault();
                e.stopPropagation();
            });
        }
    }

    setKey(element = this.hovered, key = "") {
        const index = this.labels.indexOf(element);
        element.innerText = (KeyNameMap[key] || key).toUpperCase();
        this.keys[index] = key;
        this.save();
    }

    /** @param {KeyboardEvent} e */
    keyDown(e) {
        if (e.ctrlKey) return;
        if (e.key == "Tab") e.preventDefault();
        if (e.key == "Escape") this.hud.toggle();
        if (e.key == "Enter") this.hud.toggle(this.hud.chatInput);
        if (this.pressing.has(e.key)) return;
        this.pressing.add(e.key);

        const key = e.key;

        if (this.hovered) this.setKey(this.hovered, key);

        const action = events[this.keys.indexOf(key)];
        if (!action) return;
        const state = this.hud.state;

        switch (action) {
            case "Feed":         state.macro    = 1; break;
            case "Split":        state.splits   = 1; break;
            case "Double Split": state.splits   = 2; break;
            case "Triple Split": state.splits   = 3; break;
            case "Quad Split":   state.splits   = 4; break;
            case "Line Lock":    state.lineLock = 1; break;
            case "Respawn":      state.respawn  = 1; break;
        }
    }

    /** @param {KeyboardEvent} e */
    keyUp(e) {
        if (e.ctrlKey) return;
        this.pressing.delete(e.key);

        const key = e.key;

        const action = events[this.keys.indexOf(key)];
        if (!action) return;
        const state = this.hud.state;

        switch (action) {
            case "Feed":         state.macro   = 0; break;
        }
    }

    blur() {
        this.hud.state.focused = 0;
    }

    focus() {
        this.hud.state.focused = 1;
        for (const k of this.pressing) this.keyUp(k);
        this.pressing.clear();
    }
}