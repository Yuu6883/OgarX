/** @type {Worker} */
let worker = null;
/** @type {HTMLCanvasElement} */
let canvas = null;

const Mouse = new class {

    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(12)) {
        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get x() { return Atomics.load(this.buffer, 0); }
    set x(v) { Atomics.store(this.buffer, 0, v) }

    get y() { return Atomics.load(this.buffer, 1); }
    set y(v) { Atomics.store(this.buffer, 1, v); }

    get scroll() { return Atomics.load(this.buffer, 2); }
    set scroll(v) { Atomics.store(this.buffer, 2, v); }
    updateScroll(v) { Atomics.add(this.buffer, 2, -v); }
    resetScroll() { return Atomics.exchange(this.buffer, 2, 0); }
}

window.onload = () => {
    worker = new Worker("js/renderer.js");
    worker.onmessage = e=> {
        const { data } = e;
        if (data.resized) {
            canvas.style.width  = data.resized.width;
            canvas.style.height = data.resized.height;
        }
    }

    canvas = document.getElementById("canvas");
    canvas.style.width  = window.innerWidth;
    canvas.style.height = window.innerHeight;

    const offscreen = canvas.transferControlToOffscreen();
    offscreen.width = window.innerWidth;
    offscreen.height = window.innerHeight;

    worker.postMessage({ offscreen, mouse: Mouse.sharedBuffer }, [offscreen]);
    
    console.log("Document loaded");
}

window.onresize = () => {
    worker && worker.postMessage({
        resize: true,
        width:  window.devicePixelRatio * window.innerWidth,
        height: window.devicePixelRatio * window.innerHeight,
    });
}

// Ctrl + and -
window.onkeydown = event => {
    if((event.keyCode == 107 && event.ctrlKey == true) || 
       (event.keyCode == 109 && event.ctrlKey == true)) {
        event.preventDefault(); 
    }
}

const wheelEvt = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
          document.onmousewheel !== undefined ? "mousewheel" :          // Webkit and IE support at least "mousewheel"
          "DOMMouseScroll";

window.addEventListener("mousemove", e => {
    Mouse.x = e.clientX;
    Mouse.y = e.clientY;
});

window.addEventListener(wheelEvt, e => Mouse.updateScroll(e.deltaY));