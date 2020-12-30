const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
window.onload = () => {
    const worker = new Worker("js/renderer.min.js");
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
    worker.postMessage(initObject, [offscreen]);
    worker.onmessage = e => {
        if (e.data === "ready") {
            const sharedServer = new SharedWorker("js/sw.min.js", "ogar-x-server");
            worker.postMessage(sharedServer.port, [sharedServer.port]);
        }
    }

    /** @type {Set<string>} */
    const pressing = new Set();
    window.addEventListener("keydown", e => {
        if (e.key == "Tab") e.preventDefault();
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
    window.addEventListener("blur", _ => state.focused = 0);
    window.addEventListener("focus", _ => state.focused = 1);
    state.focused = 1;
    canvas.addEventListener("mousemove", e => (mouse.x = e.clientX, mouse.y = e.clientY));
    canvas.addEventListener("wheel", e => mouse.updateScroll(e.deltaY), { passive: true });
}