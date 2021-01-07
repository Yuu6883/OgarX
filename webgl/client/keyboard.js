const events = ["Feed", "Split", "Double Split", "Triple Split", "Quad Split", "Respawn"];

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
            this.keys = ["w", " ", "g", "z", "q", "n"];
        }

        this.menuElem = document.getElementById("key-menu");

        this.openElem = document.getElementById("keyboard");
        this.openElem.addEventListener("click", () => {
            this.openElem.style.opacity = 0;
            this.hud.toggle(this.menuElem);
            this.menuElem.style.left = "0px";
        });

        this.closeElem = document.getElementById("close-key-menu");
        this.closeElem.addEventListener("click", () => {
            this.openElem.style.opacity = 1;
            this.hud.toggle(this.menuElem);
            this.menuElem.style.left = "-200px";
        });

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
            const label = document.createElement("h4");
            const k = this.keys[i].toUpperCase();
            label.textContent = `${events[i]}: `;
            const b = document.createElement("b");
            b.innerText = (KeyNameMap[k] || k).toUpperCase();
            b.classList.add("hot-key");
            label.appendChild(b);
            keys.appendChild(label);
            this.labels.push(b);

            b.addEventListener("mouseenter", _ => {
                this.hovered = b;
            });

            b.addEventListener("mouseleave", _ => {
                this.hovered = null;
            });
        }
    }

    keyDown(key = "") {
        if (this.hovered) {
            const index = this.labels.indexOf(this.hovered);
            this.hovered.innerText = (KeyNameMap[key] || key).toUpperCase();
            this.keys[index] = key;
            this.save();
        }

        const action = events[this.keys.indexOf(key)];
        if (!action) return;
        const state = this.hud.state;

        switch (action) {
            case "Feed":         state.macro   = 1; break;
            case "Split":        state.splits  = 1; break;
            case "Double Split": state.splits  = 2; break;
            case "Triple Split": state.splits  = 3; break;
            case "Quad Split":   state.splits  = 4; break;
            case "Respawn":      state.respawn = 1; break;
        }
    }

    keyUp(key = "") {
        const action = events[this.keys.indexOf(key)];
        if (!action) return;
        const state = this.hud.state;

        switch (action) {
            case "Feed":         state.macro   = 0; break;
        }
    }
}