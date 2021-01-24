const Stats = require("./stats");
const Mouse = require("./mouse");
const State = require("./state");
const Input = require("./input");
const Skins = require("./skins");
const Options = require("./options");
const Minimap = require("./minimap");
const Viewport = require("./viewport");

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
        this.server = "";
        
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
                if (data.event === "connect") this.onConnect(data.server);
                if (data.event === "disconnect") this.onDisconnect();
                if (data.event === "error") this.onError(data.message || "");
                if (data.event === "minimap") this.minimap.onData(data.minimap);
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
        elem.classList.add("fade-in");
        elem.classList.remove("fade-out");
        elem.hidden = false;
        elem.focus();
    }

    hide(elem = this.hudElem) {
        elem.classList.remove("fade-in");
        elem.classList.add("fade-out");
        setTimeout(() => elem.hidden = true, 250);
        elem.blur();
    }

    toggle(elem = this.hudElem) {
        elem.hidden ? this.show(elem) : this.hide(elem);
    }

    resize() {
        
        let w = Math.floor(window.devicePixelRatio * window.innerWidth);
        let h = Math.floor(window.devicePixelRatio * window.innerHeight);

        this.viewport.width  = w;
        this.viewport.height = h;
        
        this.canvas.style.width = window.innerWidth + "px";
        this.canvas.style.height = window.innerHeight + "px";
    }

    registerEvents() {
        window.onresize = this.resize.bind(this);
        this.resize();

        document.addEventListener("contextmenu", e => e.preventDefault());

        this.input = new Input(this);
        this.options = new Options(this);
        
        this.state.focused = 1;

        window.addEventListener("keydown", e => this.input.keyDown(e));
        window.addEventListener("keyup", e => this.input.keyUp(e));
        window.addEventListener("blur", _ => this.input.blur());
        window.addEventListener("focus", _ => this.input.focus());
        window.addEventListener("mousedown", e => this.input.keyDown({ key: `MOUSE ${e.button}`}));
        window.addEventListener("mouseup",   e => this.input.keyUp({ key: `MOUSE ${e.button}`}));

        window.addEventListener("mousemove", e => {
            this.mouse.x = e.clientX * window.devicePixelRatio;
            this.mouse.y = e.clientY * window.devicePixelRatio;
        });

        canvas.addEventListener("wheel", e => {
            if (e.ctrlKey) return;
            this.mouse.updateScroll(e.deltaY);
        }, { passive: true });
    }

    updateSkin(ignoreError = false) {

        if (!this.skin) {
            this.skinElem.src = "/static/img/skin.png";
            return;
        } else console.log(`Loading skin from ${this.skin}`);

        const img = new Image();
        img.onload = () => {
            this.skins.current = this.skinElem.src = this.skin;
        }
        ignoreError || (img.onerror = () => {
            this.onError(`Failed to load skin "${this.skin}"`);
            this.skinElem.src = "/static/img/skin.png";
        });
        img.src = this.skin;
    }

    initUIComponents() {
        this.hudElem = document.getElementById("hud");
        this.skinElem = document.getElementById("skin");
        this.skinInput = document.getElementById("skin-input");
        this.serverInput = document.getElementById("server-input");
        this.nameInput = document.getElementById("name-input");

        this.minimap = new Minimap(this);
        this.skins = new Skins(this);
        this.skinInput.value = this.skins.current;

        this.skinInput.addEventListener("blur", () => this.updateSkin());

        this.playButton = document.getElementById("play");
        this.playButton.addEventListener("click", () => {
            this.hide();
            this.spawn();
            this.playButton.blur();
        });
        this.spectateButton = document.getElementById("spectate");

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

        this.serverInput.value = "Select Server";
        this.serverInput.addEventListener("click", () => this.serverAccordion.toggle(0, true));
        
        this.nameInput.value = localStorage.getItem("ogarx-name") || "";

        this.nameInput.autocomplete = Math.random();
        this.skinInput.autocomplete = Math.random();
        this.serverAccordion = UIkit.accordion("#server-accordion");

        this.updateSkin(true);

        this.chatInput.addEventListener("blur", () => this.hide(this.chatInput));

        this.lbElem = document.getElementById("leaderboard-data");

        if (/^https?\:\/\/localhost$/.test(window.origin)) {
            const localButton1 = document.createElement("button");
            localButton1.classList.add("servers", "uk-inline");
            localButton1.setAttribute("server", "localhost:3000/mega");
            localButton1.innerText = "Dev Mega";
            document.getElementById("server-list").append(localButton1);

            const localButton2 = document.createElement("button");
            localButton2.classList.add("servers", "uk-inline");
            localButton2.setAttribute("server", "localhost:3001/covid");
            localButton2.innerText = "Dev Covid";
            document.getElementById("server-list").append(localButton2);
            window.hud = this;
        }

        document.querySelectorAll(".servers").forEach(e => {
            e.addEventListener("click", () => {
                this.server = e.textContent;
                const server = e.attributes.getNamedItem("server").value;
                this.connect(server);
            });
        });

        this.pingElem = document.getElementById("ping");
        this.fpsElem = document.getElementById("fps");
        this.bwElem = document.getElementById("bandwidth");
        this.mycellsElem = document.getElementById("mycells");
        this.linelockElem = document.getElementById("linelock");
        
        this.updateInterval = setInterval(() => {
            this.pingElem.innerText = this.stats.ping;
            this.fpsElem.innerText = this.stats.fps;
            const kbs = this.stats.bandwidth / 1024;
            this.bwElem.innerText = kbs < 1024 ? `${~~kbs}kbs` : `${(kbs / 1024).toFixed(1)}mbs`;
            this.mycellsElem.innerText = this.stats.mycells;
            this.linelockElem.innerText = this.stats.linelocked ? "LOCKED" : "UNLOCKED";
            this.stats.linelocked ? this.linelockElem.classList.add("text-danger") : this.linelockElem.classList.remove("text-danger");
        }, 100);
    }

    sendChat(chat) {
        if (this.worker) this.worker.postMessage({ chat });
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

    connect(server) {
        server = server.trim();
        server == "local" ? this.connectToLocal() : this.connectToURL(
            `${window.location.protocol.replace("http", "ws")}//${server}`);
    }

    onError(message) {
        UIkit.notification({ message, status: "danger", timeout: 3000 });
    }

    onConnect(serverName = "Server") {
        this.serverInput.value = this.server;
        this.show(this.playButton);
        this.show(this.spectateButton);
        this.chatElem.innerHTML = "";
        this.onChat(0, null, "Connected");

        this.show(document.getElementById("stats1"));
        this.show(document.getElementById("stats2"));
        this.show(document.getElementById("leaderboard"));
        document.getElementById("server-name").innerText = serverName;
        this.serverAccordion.toggle(0, true);
    }

    onDisconnect() {
        this.lbElem.innerHTML = "";
        this.chatElem.innerHTML = "";
        this.hide(this.playButton);
        this.hide(this.spectateButton);

        this.show();
        this.onError("Disconnected");
        
        this.hide(document.getElementById("stats1"));
        this.hide(document.getElementById("stats2"));
        this.hide(document.getElementById("leaderboard"));
        document.getElementById("server-name").innerText = "";
        this.serverAccordion.toggle(0, true);
    }

    spawn() {
        const name = this.name;
        const skin = this.skin;
        
        localStorage.setItem("ogarx-name", name);

        if (this.worker) {
            this.worker.postMessage({ spawn: true, name, skin });
        } else {
            const p = this.renderer.protocol;
            p.once("open", () => p.spawn(name, skin));
        }
    }

    connectToLocal() {
        this.sw = new SharedWorker("js/sw.min.js", "ogar-x-server");
        if (this.worker) {
            this.worker.postMessage({ connect: this.sw.port, name: this.name, skin: this.skin }, [this.sw.port]);
        } else {
            const p = this.renderer.protocol;
            p.connect(sw.port, this.name, this.skin);
        }
    }

    connectToURL(url) {
        if (this.worker) {
            this.worker.postMessage({ connect: url, name: this.name, skin: this.skin });
        } else {
            this.renderer.protocol.connect(url, this.name, this.skin);
        }
    }
}