const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");

module.exports = class HUD {

    constructor() {
        this.worker = new Worker("js/renderer.min.js");
        this.canvas = document.getElementById("canvas");
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.showing = true;
        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();

        const offscreen = canvas.transferControlToOffscreen();
        const initObject = { 
            offscreen, 
            mouse: this.mouse.sharedBuffer, 
            state: this.state.sharedBuffer,
            viewport: this.viewport.sharedBuffer 
        };

        this.worker.postMessage(initObject, [offscreen]);
        this.worker.onmessage = e => {
            if (e.data === "ready") this.ready = true;
        }

        this.registerEvents();
        this.resize();
        this.initUIComponents();
    }

    show() {
        this.showing = true;
        this.hudElem.style.opacity = 1;
        setTimeout(() => this.hudElem.style.zIndex = 1, 250);
    }

    hide() {
        this.showing = false;
        this.hudElem.style.opacity = 0;
        setTimeout(() => this.hudElem.style.zIndex = 0, 250);
    }

    toggle() {
        this.showing ? this.hide() : this.show();
    }

    resize() {
        console.log("RESIZING");
        this.viewport.width  = window.devicePixelRatio * window.innerWidth;
        this.viewport.height = window.devicePixelRatio * window.innerHeight;
        this.canvas.style.width = window.innerWidth;
        this.canvas.style.height = window.innerHeight;
    }

    registerEvents() {
        window.onresize = () => this.resize.bind(this);

        /** @type {Set<string>} */
        this.pressing = new Set();
        const state = this.state;

        window.addEventListener("keydown", e => {
            if (e.key == "Tab") e.preventDefault();
            if (e.key == "Escape") this.toggle();
            if (this.pressing.has(e.key)) return;
            if (e.key == "w") state.macro = 1;
            if (e.key == " ") state.splits = 1; // Atomic add, instead of store
            if (e.key == "g") state.splits = 2;
            if (e.key == "z") state.splits = 3;
            if (e.key == "q") state.splits = 4;
            if (e.key == "n") state.respawn = 1;
            this.pressing.add(e.key);
        });

        window.addEventListener("keyup", e => {
            if (e.key == "w") state.macro = 0;
            this.pressing.delete(e.key);
        });

        window.addEventListener("blur", _ => state.focused = 0);
        window.addEventListener("focus", _ => state.focused = 1);
        state.focused = 1;

        canvas.addEventListener("mousemove", e => (this.mouse.x = e.clientX, this.mouse.y = e.clientY));
        canvas.addEventListener("wheel", e => this.mouse.updateScroll(e.deltaY), { passive: true });
    }

    initUIComponents() {
        this.hudElem = document.getElementById("hud");
        this.skinElem = document.getElementById("skin");
        this.skinInput = document.getElementById("skin-input");
        this.serverInput = document.getElementById("server-input");
        this.nameInput = document.getElementById("name-input");

        this.skinInput.addEventListener("blur", () => {
            const img = new Image();
            img.onload = () => {
                this.skinInput.classList.remove("danger");
                this.skinElem.src = this.skin;
            }
            img.onerror = () => this.skinInput.classList.add("danger");
            img.src = this.skin;
        });

        this.connectButton = document.getElementById("connect");
        this.connectButton.addEventListener("click", () => {
            this.spawn();
            this.hide();
            this.connectButton.blur();
        });
    }

    get skin() { return this.skinInput.value; }
    get name() { return this.nameInput.value; }
    get server() { return this.serverInput.value; }

    spawn() {
        this.server == "local" ? this.connectToLocal() : this.connectToURL(this.server);
        this.worker.postMessage({ spawn: true, name: this.name, skin: this.skin });
    }

    connectToLocal() {
        const sw = new SharedWorker("js/sw.min.js", "ogar-x-server");
        this.worker.postMessage({ connect: sw.port }, [sw.port]);
    }

    connectToURL(url) {
        this.worker.postMessage({ connect: url });
    }
}