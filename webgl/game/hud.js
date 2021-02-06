const { getColor } = require("./util");
const Stats = require("./stats");
const Mouse = require("./mouse");
const State = require("./state");
const Input = require("./input");
const Skins = require("./skins");
const Options = require("./options");
const Minimap = require("./minimap");
const Viewport = require("./viewport");
const ReplayMenu = require("./replay");

const msToText = ms => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const s = ms / 1000;
    if (s < 60) return `${Math.round(s)}s`;
    const m = s / 60;
    if (m < 60) return `${Math.round(m)}min`;
    const h = m / 60;
    return `${h.toFixed(1)}h`;
}

const scoreToText = s => s > 1000000 ? `${(s / 1000000).toFixed(2)}M` : s > 1000 ? `${(s / 1000).toFixed(1)}K` : s;
const SVG = "http://www.w3.org/2000/svg";

module.exports = class HUD {

    constructor() {
        /** @type {HTMLCanvasElement} */
        this.canvas = document.getElementById("canvas");
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.showing = true;
        this.stats = new Stats();
        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();
        this.server = "";
        
        this.registerEvents();
        this.initUIComponents();
        
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
                if (data.event === "minimap") this.minimap.onData(data.minimap);
                if (data.event === "stats") this.onStats(data.kills, data.score, data.surviveTime);
                if (data.event === "replay") this.onReplay(data.state);
                if (data.event === "error") this.onError(data.message || "Unknown Error");
                if (data.event === "warning") this.onWarning(data.message || "Unknown Warning");
            }
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
                .then(() => this.renderer.initEngine());
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
        const w = 1920; //Math.floor(this.state.resolution * window.devicePixelRatio * window.innerWidth);
        const h = 1080; // Math.floor(this.state.resolution * window.devicePixelRatio * window.innerHeight);

        this.viewport.width  = w;
        this.viewport.height = h;
        
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
    }

    registerEvents() {
        // window.onresize = this.resize.bind(this);
        this.resize();

        document.addEventListener("contextmenu", e => e.preventDefault());

        this.input = new Input(this);
        this.options = new Options(this);
        
        this.state.visible = !document.hidden;

        document.addEventListener("visibilitychange", () => this.state.visible = !document.hidden);
        
        window.addEventListener("keydown", e => this.input.keyDown(e));
        window.addEventListener("keyup", e => this.input.keyUp(e));
        window.addEventListener("blur", _ => this.input.blur());
        window.addEventListener("focus", _ => this.input.focus());
        window.addEventListener("mousedown", e => this.input.keyDown({ key: `MOUSE ${e.button}`}));
        window.addEventListener("mouseup",   e => this.input.keyUp({ key: `MOUSE ${e.button}`}));

        window.addEventListener("mousemove", e => {
            this.mouse.x = ~~(4096 * (2 * e.clientX / window.innerWidth - 1));
            this.mouse.y = ~~(4096 * (2 * e.clientY / window.innerHeight - 1));
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
        } // else console.log(`Loading skin from ${this.skin}`);

        const img = new Image();
        img.onload = () => this.skins.current = this.skinElem.src = this.skin;
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

        this.replays = new ReplayMenu(this);
        this.replays.init();

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
        // TODO
        this.spectateButton = document.getElementById("spectate");
        this.respawnButton = document.getElementById("respawn-button");
        this.respawnButton.addEventListener("click", () => this.state.respawn = 1);

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
        
        this.nameInput.value = localStorage.getItem("ogarx-name") || "";

        this.nameInput.autocomplete = Math.random();
        this.skinInput.autocomplete = Math.random();
        this.serverTab = UIkit.offcanvas("#server-menu-offcanvas");

        this.updateSkin(true);

        this.chatInput.addEventListener("blur", () => this.hide(this.chatInput));

        this.lbElem = document.getElementById("leaderboard-data");

        const gateways = [...document.querySelectorAll('[gateway]').values()]
            .map(node => ({ list: node, gateway: node.getAttribute("gateway") }));

        if (/^https?\:\/\/localhost$/.test(window.origin)) {
            gateways.push({ list: document.querySelector("[region='Dev']"), gateway: "localhost:6969" });
            window.hud = this;
        }

        /** @type {Map<string, { signal: HTMLElement, pie: SVGElement }>} */
        const elemTable = new Map();
        const po = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.initiatorType != "fetch") return;
                const elem = elemTable.get(entry.name);
                if (!elem) return;
                const ping = ~~entry.duration;
                const { signal } = elem;
                signal.setAttribute("uk-tooltip", `${ping} ms`);
                if (ping < 100) signal.className = "signal-good";
                else if (ping < 200) signal.className = "signal-ok";
                else if (ping < 300) signal.className = "signal-bad";
                else signal.className = "signal-worse";
            }
        });
        po.observe({ type: 'resource', buffered: true });

        for (const { list, gateway } of gateways) {
            /** @type {Map<string, HTMLElement>} */
            const servers = new Map();
            
            /** @type {Map<string, SVGCircleElement>} */
            const pies = new Map();

            const region = list.getAttribute("region");
            const source = new EventSource(`${window.location.protocol}//${gateway}/gateway`);
        
            let timeout;
            const ping = async (endpoint = "", t = 5000) => {
                try {
                    await fetch(`${window.location.protocol}//${endpoint}/ping`);
                } catch (e) {}
                timeout = setTimeout(ping, t, endpoint);
            }
            
            const pieSVG = document.getElementById(`${region.toLowerCase()}-server-stats`);
            const text = pieSVG.previousElementSibling;

            source.onopen = () => {
                if (!timeout) {
                    elemTable.set(`${window.location.protocol}//${gateway}/ping`, {
                        signal: document.getElementById(`signal-${region.toLowerCase()}`)
                    });
                    ping(gateway, 1000);
                }
            }
            
            source.addEventListener("servers", event => {
                /** @type {{ servers: { uid: number, name: string, endpoint: string, bot: number, players: number, total: number, load: number }[]}} */
                const data = { servers: JSON.parse(event.data) };

                let totalUsage = 0;
                const init = ~~(Math.random() * 100);
                for (const id in data.servers) {
                    const server = data.servers[id];
                    let elem = servers.get(server.uid);
                    
                    const [r, g, b] = getColor(5 * id + init);
                    const color = `rgb(${~~(255 * r)}, ${~~(255 * g)}, ${~~(255 * b)})`;

                    if (!elem) {
                        elem = document.createElement("p");
                        elem.classList.add("servers");
                        elem.innerHTML = `<span>${server.name}</span><span style="float: right" uk-tooltip="${server.bot} bots">${server.players}/${server.total}</span>`;
                        elem.style.borderRight = `2px solid ${color}`;
                        list.appendChild(elem);
                        servers.set(server.uid, elem);

                        elem.addEventListener("click", () => {
                            this.server = `${region} ${server.name}`;
                            this.connect(`${gateway.replace(/\:\d+$/, "")}:${server.endpoint}`);
                        });
                    } else {
                        elem.children[0].textContent = server.name;
                        elem.children[1].setAttribute("uk-tooltip", `${server.bot} bots`);
                        elem.children[1].textContent = `${server.players}/${server.total}`;
                    }

                    const percent = server.load * 100;
                    let pie = pies.get(server.uid);
                    if (!pie) {
                        pie = document.createElementNS(SVG, "circle");
                        pie.setAttribute("cx", "21");
                        pie.setAttribute("cy", "21");
                        pie.setAttribute("r", "15.91549430918954");
                        pie.setAttribute("fill", "transparent");
                        pie.setAttribute("stroke-width", (8 - ~~id / 100).toString())
                        pie.setAttribute("stroke", color);
                        pie.setAttribute("stroke-dashoffset", "25");
                        pieSVG.prepend(pie);
                        pies.set(server.uid, pie);
                    }
                    totalUsage = Math.min(100, totalUsage + percent);
                    pie.setAttribute("stroke-dasharray", `${Math.ceil(totalUsage)} ${100 - Math.ceil(totalUsage)}`);
                }

                text.textContent = ~~totalUsage + "%";

                for (const [k, v] of [...servers.entries()]) {
                    if (!data.servers.some(s => s.uid == k)) {
                        servers.delete(k);
                        pies.get(k).remove();
                        pies.delete(k);
                        v.remove();
                    }
                }
            });
        }

        document.querySelector('[server="local"]').addEventListener("click", () => this.connectToLocal());

        this.gameoverElem = document.getElementById("game-over");
        this.respawnSpinner = document.getElementById("respawn-spinner");
        this.pingElem = document.getElementById("ping");
        this.fpsElem = document.getElementById("fps");
        this.bwElem = document.getElementById("bandwidth");
        this.mycellsElem = document.getElementById("mycells");
        this.linelockElem = document.getElementById("linelock");
        this.scoreElem = document.getElementById("score");

        this.updateInterval = setInterval(() => {
            this.pingElem.innerText = this.stats.ping;
            this.fpsElem.innerText = this.stats.fps;
            const kbs = this.stats.bandwidth / 1024;
            this.bwElem.innerText = kbs < 1024 ? `${~~kbs}KBs` : `${(kbs / 1024).toFixed(1)}MBs`;
            const c = this.mycellsElem.innerText = this.stats.mycells;
            this.linelockElem.innerText = this.stats.linelocked ? "LOCKED" : "UNLOCKED";
            this.stats.linelocked ? this.linelockElem.classList.add("text-danger") : this.linelockElem.classList.remove("text-danger");
            this.scoreElem.innerText = scoreToText(this.stats.score);

            if (c && !this.gameoverElem.hidden) this.hide(this.gameoverElem);
        }, 50);
    }

    replay(replay = 0) {
        this.hide();
        if (this.worker) this.worker.postMessage({ replay });
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

    /** @param {"success"|"failed"|"starting"} state */
    onReplay(state) {
        switch (state) {
            case "starting":
                this.onWarning("Saving Clip...");
                break;
            case "failed":
                this.onError("Failed to Save Clip");
                break;
            case "success":
                this.onSuccess("Clip Saved!");
                break;
        }
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

    onSuccess(message) {
        UIkit.notification({ message, status: "success", timeout: 3000 });
    }

    onWarning(message) {
        UIkit.notification({ message, status: "warning", timeout: 3000 });
    }

    onError(message) {
        UIkit.notification({ message, status: "danger", timeout: 3000 });
    }

    /**
     * @param {number} kills 
     * @param {number} score 
     * @param {number} surviveTime 
     */
    onStats(kills, score, surviveTime) {
        document.getElementById("kills").innerText = kills;
        document.getElementById("max-score").innerText = scoreToText(score);
        document.getElementById("survive-time").innerText = msToText(surviveTime);
        this.show(this.gameoverElem);

        const a = this.state.auto_respawn;
        if (a) {
            this.respawnSpinner.hidden = false;
            this.respawnButton.setAttribute("disabled", "");
            this.respawnButton.innerText = "Respawning";
        } else {
            this.respawnSpinner.hidden = true;
            this.respawnButton.removeAttribute("disabled");
            this.respawnButton.innerText = "Respawn";
        }
    }

    showStats() {
        this.show(document.getElementById("stats1"));
        this.show(document.getElementById("stats2"));
        this.show(document.getElementById("stats3"));
    }

    hideStats() {
        this.hide(document.getElementById("stats1"));
        this.hide(document.getElementById("stats2"));
        this.hide(document.getElementById("stats3"));
    }

    onConnect(serverName = "Server") {
        this.serverInput.value = this.server;
        this.show(this.playButton);
        this.show(this.spectateButton);
        this.chatElem.innerHTML = "";
        this.onChat(0, null, "Connected");
        this.showStats();
        this.show(document.getElementById("leaderboard"));
        document.getElementById("server-name").innerText = serverName;
        this.serverTab.hide();
    }

    onDisconnect() {
        this.lbElem.innerHTML = "";
        this.chatElem.innerHTML = "";
        this.hide(this.playButton);
        this.hide(this.spectateButton);

        this.show();
        this.onError("Disconnected");
        
        this.hide(this.gameoverElem);
        this.hideStats();
        this.hide(document.getElementById("leaderboard"));
        this.minimap.clear();
        document.getElementById("server-name").innerText = "";
        this.serverTab.show();
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