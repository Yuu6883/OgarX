const Stats = require("./stats");
const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
const Keyboard = require("./keyboard");

module.exports = class HUD {

    constructor() {

        this.canvas = document.getElementById("canvas");
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.showing = true;
        this.stats = new Stats();
        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();
        
        if (navigator.userAgent.includes("Chrome")) {

            this.worker = new Worker("js/renderer.min.js");
            const offscreen = this.canvas.transferControlToOffscreen();
            const initObject = { 
                offscreen, 
                stats: this.stats.sharedBuffer,
                mouse: this.mouse.sharedBuffer, 
                state: this.state.sharedBuffer,
                viewport: this.viewport.sharedBuffer 
            };
    
            this.worker.postMessage(initObject, [offscreen]);
            this.worker.onmessage = e => {
                const { data } = e;
                if (data.event === "ready") this.ready = true;
                if (data.event === "chat") this.onChat(data.pid, data.player, data.message);
                if (data.event === "leaderboard") this.onLeaderboard(data.lb);
                if (data.event === "connect") this.onConnect();
                if (data.event === "disconnect") this.onDisconnect();
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
                    this.renderer.stats = this.stats;
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
        
        let w = Math.floor(window.devicePixelRatio * window.innerWidth);
        let h = Math.floor(window.devicePixelRatio * window.innerHeight);

        if (w > screen.width) {
            w = screen.width;
            h = Math.floor(h * screen.width / w);
        } 

        if (h > screen.height) {
            w = Math.floor(w * screen.height / h);
            h = screen.height;
        }

        this.viewport.width  = w;
        this.viewport.height = h;
        
        this.canvas.style.width = window.innerWidth + "px";
        this.canvas.style.height = window.innerHeight + "px";
    }

    registerEvents() {
        window.onresize = this.resize.bind(this);
        this.resize();

        this.keys = new Keyboard(this);
        /** @type {Set<string>} */
        this.pressing = new Set();
        const state = this.state;

        window.addEventListener("keydown", e => {
            if (e.key == "Tab") e.preventDefault();
            if (e.key == "Escape") this.toggle();
            if (e.key == "Enter") this.toggle(this.chatInput);
            if (this.pressing.has(e.key)) return;
            this.keys.keyDown(e.key);
            this.pressing.add(e.key);
        });

        window.addEventListener("keyup", e => {
            this.keys.keyUp(e.key);
            this.pressing.delete(e.key);
        });

        window.addEventListener("blur", _ => {
            state.focused = 0;
        });

        window.addEventListener("focus", _ => {
            state.focused = 1;
            for (const k of this.pressing) this.keys.keyUp(k);
            this.pressing.clear();
        });

        state.focused = 1;

        canvas.addEventListener("mousemove", e => {
            this.mouse.x = e.clientX * window.devicePixelRatio;
            this.mouse.y = e.clientY * window.devicePixelRatio;
        });
        canvas.addEventListener("wheel", e => {
            if (e.ctrlKey) return;
            this.mouse.updateScroll(e.deltaY);
        }, { passive: true });
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

        this.playButton = document.getElementById("play");
        this.playButton.addEventListener("click", () => {
            this.spawn();
            this.hide();
            this.playButton.blur();
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
                }
                this.hide(this.chatInput);
                this.canvas.focus();
            }
        });
        this.chatElem.addEventListener("focus", () => {
            this.chatElem.blur();
            this.canvas.focus();
        });
        this.chatElem.addEventListener("wheel", e => e.stopPropagation(), { passive: true });

        this.serverInput.value = localStorage.getItem("ogarx_server") || "local";
        this.nameInput.value = localStorage.getItem("ogarx_name") || "";
        this.skinInput.value = localStorage.getItem("ogarx_skin") || "";
        updateSkin(true);

        this.chatInput.addEventListener("blur", () => this.hide(this.chatInput));

        this.lbElem = document.getElementById("leaderboard-data");

        document.querySelectorAll(".servers").forEach(e => {
            e.addEventListener("click", () => {
                const server = e.attributes.getNamedItem("server").value;
                this.serverInput.value = server;
                this.connect();
            });
        });

        this.pingElem = document.getElementById("ping");
        this.fpsElem = document.getElementById("fps");
        this.bwElem = document.getElementById("bandwidth");
        // this.cellsElem = document.getElementById("cells");
        // this.textElem = document.getElementById("text");
        
        this.updateInterval = setInterval(() => {
            this.pingElem.innerText = this.stats.ping;
            this.fpsElem.innerText = this.stats.fps;
            const kbs = this.stats.bandwidth / 1024;
            this.bwElem.innerText = kbs < 1024 ? `${~~kbs}kbs` : `${(kbs / 1024).toFixed(1)}mbs`;
            // this.cellsElem.innerText = this.stats.cells;
            // this.textElem.innerText = this.stats.text;
        }, 1000);
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
        elem.textContent = pid ? `${player.name || "Unnamed"}: ${message}` : message;
        elem.classList.add(`player-${pid}`);
        this.chatElem.appendChild(elem);
        this.chatElem.scrollTo(0, this.chatElem.scrollHeight);
    }

    /**
     * @param {Object} lb 
     * @param {number} lb.rank
     * @param {{ name: string, skin: string }} lb.me
     * @param {{ name: string, skin: string }[]} lb.players
     */
    onLeaderboard(lb) {
        const { players, rank, me } = lb;
        this.lbElem.innerHTML = "";

        for (const i in players) {
            const e = document.createElement("p");
            e.textContent = `${~~i + 1}. ${players[i] ? players[i].name : ""}`;
            if (i == rank) e.classList.add("me");
            this.lbElem.appendChild(e);
        }

        if (!players[rank] && rank != 65535) {
            const e = document.createElement("p");
            e.textContent = `${rank + 1}. ${me.name || ""}`;
            e.classList.add("me");
            this.lbElem.appendChild(e);
        }
    }

    get skin() { return this.skinInput.value; }
    get name() { return this.nameInput.value; }
    get server() { return this.serverInput.value; }

    connect() {
        const server = this.server.trim();
        server == "local" ? this.connectToLocal() : this.connectToURL(
            `${window.location.protocol.replace("http", "ws")}//${server}`);
        localStorage.setItem("ogarx_server", server);
    }

    onConnect() {
        this.playButton.disabled = false;
    }

    onDisconnect() {
        this.show(this.hudElem);
        this.playButton.disabled = true;
    }

    spawn() {
        const name = this.name;
        const skin = this.skin;
        
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
        console.log(`Connecting to local shared worker server`);
        const sw = new SharedWorker("js/sw.min.js", "ogar-x-server");
        if (this.worker) {
            this.worker.postMessage({ connect: sw.port, name: this.name, skin: this.skin }, [sw.port]);
        } else {
            const p = this.renderer.protocol;
            p.connect(sw.port, this.name, this.skin);
        }
    }

    connectToURL(url) {
        console.log(`Connecting to remote server`);
        if (this.worker) {
            this.worker.postMessage({ connect: url, name: this.name, skin: this.skin });
        } else {
            this.renderer.protocol.connect(url, this.name, this.skin);
        }
    }
}