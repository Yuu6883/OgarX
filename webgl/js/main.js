const Mouse = require("./mouse");
const Viewport = require("./viewport");
window.onload = () => {
    const worker = new Worker("js/renderer.js");
    const canvas = document.getElementById("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const mouse = new Mouse();
    const viewport = new Viewport();
    (window.onresize = () => {
        viewport.width  = window.devicePixelRatio * window.innerWidth;
        viewport.height = window.devicePixelRatio * window.innerHeight;
        canvas.style.width = window.innerWidth;
        canvas.style.height = window.innerHeight;
    })();
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ offscreen, mouse: mouse.sharedBuffer, viewport: viewport.sharedBuffer }, [offscreen]);
    // window.onkeydown = e => (e.keyCode == 107 || e.keyCode == 109) && e.ctrlKey == true && e.preventDefault();  
    canvas.addEventListener("mousemove", e => (mouse.x = e.clientX, mouse.y = e.clientY));
    canvas.addEventListener("wheel", e => mouse.updateScroll(e.deltaY), { passive: true });
}