const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
window.onload = () => {
    const worker = new Worker("js/renderer.js");
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
    worker.postMessage({ offscreen, mouse: mouse.sharedBuffer, viewport: viewport.sharedBuffer, state: state.sharedBuffer }, [offscreen]);
    window.addEventListener("keydown", e => {
        if (e.key == "w") state.macro = 1;
        if (e.key == " ") state.splits = 1;
        if (e.key == "g") state.splits = 2;
        if (e.key == "z") state.splits = 3;
        if (e.key == "q") state.splits = 4;
    });
    window.addEventListener("keyup", e => {
        if (e.key == "w") state.macro = 0;
    });
    canvas.addEventListener("mousemove", e => (mouse.x = e.clientX, mouse.y = e.clientY));
    canvas.addEventListener("wheel", e => mouse.updateScroll(e.deltaY), { passive: true });
}