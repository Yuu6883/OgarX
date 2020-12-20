const Mouse = require("./mouse");
const Viewport = require("./viewport");

window.onload = () => {
    const worker = new Worker("js/renderer.js");

    /** @type {HTMLCanvasElement} */
    const canvas = document.getElementById("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const mouse = new Mouse();
    const viewport = new Viewport();

    const resize = window.onresize = () => {
        viewport.width  = window.devicePixelRatio * window.innerWidth;
        viewport.height = window.devicePixelRatio * window.innerHeight;
        canvas.style.width = window.innerWidth;
        canvas.style.height = window.innerHeight;
        // console.log(`Viewport: [${viewport.width}, ${viewport.height}]`);
    };
    resize();
    
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ offscreen, mouse: mouse.sharedBuffer, viewport: viewport.sharedBuffer }, [offscreen]);

    // Ctrl + and -
    window.onkeydown = event => {
        if((event.keyCode == 107 && event.ctrlKey == true) || 
        (event.keyCode == 109 && event.ctrlKey == true)) {
            event.preventDefault(); 
        }
    }
    
    // Thanks stackoverflow
    const wheelEvt = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
        document.onmousewheel !== undefined ? "mousewheel" : "DOMMouseScroll";

    window.addEventListener("mousemove", e => {
        mouse.x = e.clientX - window.innerWidth / 2;
        mouse.y = e.clientY - window.innerHeight / 2;
    });

    window.addEventListener(wheelEvt, e => mouse.updateScroll(e.deltaY));
}