const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");

module.exports = class HUD {

    constructor() {

        this.canvas = document.getElementById("canvas");
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.showing = true;
        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();
        
        if (navigator.userAgent.includes("Chrome")) {

            this.worker = new Worker("js/renderer.min.js");
            const offscreen = this.canvas.transferControlToOffscreen();
            const initObject = { 
                offscreen, 
                mouse: this.mouse.sharedBuffer, 
                state: this.state.sharedBuffer,
                viewport: this.viewport.sharedBuffer 
            };
    
            this.worker.postMessage(initObject, [offscreen]);
            this.worker.onmessage = e => {
                const { data } = e;
                if (data.event === "ready") this.ready = true;
                if (data.event === "chat") this.onChat(data.pid, data.player, data.message);
            }

            this.registerEvents();
            this.resize();
            this.initUIComponents();
        } else if (navigator.userAgent.includes("Firefox")) {
            fetch("js/renderer.min.js")
                .then(res => res.text())
                .then(code => {
                    eval(code);

                    /** @type {import("./renderer")} */
                    this.renderer = new Renderer(this.canvas);
                    this.renderer.mouse = this.mouse;
                    this.renderer.state = this.state;
                    this.renderer.viewport = this.viewport;
                })
                .then(() => this.renderer.initEngine())
                .then(() => {
                    this.registerEvents();
                    this.resize();
                    this.initUIComponents();
                });
        }
    }

    show(elem = this.hudElem) {
        elem.focus();
        elem.style.opacity = 1;
        elem.style.zIndex = 1;
    }

    hide(elem = this.hudElem) {
        elem.blur();
        elem.style.opacity = 0;
        setTimeout(() => elem.style.zIndex = 0, 250);
    }

    toggle(elem = this.hudElem) {
        elem.style.opacity == 1 ? this.hide(elem) : this.show(elem);
    }

    resize() {
        this.viewport.width  = window.devicePixelRatio * window.innerWidth;
        this.viewport.height = window.devicePixelRatio * window.innerHeight;
        this.canvas.style.width = window.innerWidth;
        this.canvas.style.height = window.innerHeight;
    }

    registerEvents() {
        window.onresize = this.resize.bind(this);

        /** @type {Set<string>} */
        this.pressing = new Set();
        const state = this.state;

        window.addEventListener("keydown", e => {
            if (e.key == "Tab") e.preventDefault();
            if (e.key == "Escape") this.toggle();
            if (e.key == "Enter") this.toggle(this.chatInput);
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

        const updateSkin = (ignoreError = false) => {
            const img = new Image();
            img.onload = () => {
                this.skinInput.classList.remove("danger");
                this.skinElem.src = this.skin;
            }
            ignoreError || (img.onerror = () => this.skinInput.classList.add("danger"));
            img.src = this.skin;
        }

        this.skinInput.addEventListener("blur", updateSkin);

        this.connectButton = document.getElementById("connect");
        this.connectButton.addEventListener("click", () => {
            this.spawn();
            this.hide();
            this.connectButton.blur();
        });

        this.chatElem = document.getElementById("chat");
        this.chatInput = document.getElementById("chat-input");
        this.chatInput.addEventListener("keydown", e => {
            e.stopPropagation();
            if (e.key == "Enter") {
                const message = this.chatInput.value.trim();
                if (message) {
                    this.sendChat(message);
                    this.chatInput.value = "";
                } else {
                    this.hide(this.chatInput);
                    this.canvas.focus();
                }
            }
        });
        this.chatElem.addEventListener("focus", () => {
            this.chatElem.blur();
            this.canvas.focus();
        });
        this.chatElem.addEventListener("wheel", e => e.stopPropagation());

        this.serverInput.value = localStorage.getItem("ogarx_server") || "local";
        this.nameInput.value = localStorage.getItem("ogarx_name") || "";
        this.skinInput.value = localStorage.getItem("ogarx_skin") || "";
        updateSkin(true);
    }

    sendChat(chat) {
        if (this.worker) {
            this.worker.postMessage({ chat });
        }
    }

    /**
     * @param {number} pid 
     * @param {{ name: string, skin: string }} player 
     * @param {string} message 
     */
    onChat(pid, player, message) {
        const elem = document.createElement("p");
        elem.textContent = `${player.name || "Unnamed"}: ${message}`;
        this.chatElem.appendChild(elem);
        this.chatElem.scrollTo(0, this.chatElem.scrollHeight);
    }

    get skin() { return this.skinInput.value; }
    get name() { return this.nameInput.value; }
    get server() { return this.serverInput.value; }

    spawn() {
        const server = this.server;
        const name = this.name;
        const skin = this.skin;
        
        server == "local" ? this.connectToLocal() : this.connectToURL(server);
        
        localStorage.setItem("ogarx_server", server);
        localStorage.setItem("ogarx_name", name);
        localStorage.setItem("ogarx_skin", skin);

        if (this.worker) {
            this.worker.postMessage({ spawn: true, name, skin });
        } else {
            const p = this.renderer.protocol;
            p.once("open", () => p.spawn(name, skin));
        }
    }

    connectToLocal() {
        const sw = new SharedWorker("js/sw.min.js", "ogar-x-server");
        if (this.worker) {
            this.worker.postMessage({ connect: sw.port }, [sw.port]);
        } else {
            this.renderer.protocol.connect(sw.port);
        }
    }

    connectToURL(url) {
        if (this.worker) {
            this.worker.postMessage({ connect: url });
        } else {
            this.renderer.protocol.connect(url);
        }
    }
}