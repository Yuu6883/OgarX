const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
window.onload = () => {
    const worker = new Worker("js/renderer.js");
    const sharedServer = new SharedWorker("js/sw.js", "ogar-x-server");
    const canvas = document.getElementById("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const mouse = new Mouse();
    const state = new State();
    const viewport = new Viewport();
    (window.onresize = () => {
        viewport.width  = window.devicePixelRatio * window.innerWidth;
        viewport.height = window.devicePixelRatio * window.innerHeight;
        canvas.style.width = window.innerWidth;
        canvas.style.height = window.innerHeight;
    })();
    const offscreen = canvas.transferControlToOffscreen();
    const initObject = { offscreen, 
        mouse: mouse.sharedBuffer, 
        viewport: viewport.sharedBuffer, 
        state: state.sharedBuffer
    };
    const transfer = [offscreen];
    if (true) {
        initObject.server = sharedServer.port;
        transfer.push(sharedServer.port);
    }
    worker.postMessage(initObject, transfer);
    /** @type {Set<string>} */
    const pressing = new Set();
    window.addEventListener("keydown", e => {
        if (pressing.has(e.key)) return;
        if (e.key == "w") state.macro = 1;
        if (e.key == " ") state.splits = 1; // Atomic add, instead of store
        if (e.key == "g") state.splits = 2;
        if (e.key == "z") state.splits = 3;
        if (e.key == "q") state.splits = 4;
        if (e.key == "n") state.respawn = 1;
        pressing.add(e.key);
    });
    window.addEventListener("keyup", e => {
        if (e.key == "w") state.macro = 0;
        pressing.delete(e.key);
    });
    canvas.addEventListener("mousemove", e => (mouse.x = e.clientX, mouse.y = e.clientY));
    canvas.addEventListener("wheel", e => mouse.updateScroll(e.deltaY), { passive: true });
}