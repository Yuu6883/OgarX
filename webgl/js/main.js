/** @type {Worker} */
let worker = null;
/** @type {HTMLCanvasElement} */
let canvas = null;

window.onload = () => {
    worker = new Worker("js/worker.js");
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

    worker.postMessage({ offscreen }, [offscreen]);
    
    console.log("Document loaded");
}

window.onresize = () => {
    worker && worker.postMessage({
        resize: true,
        width:  window.devicePixelRatio * window.innerWidth,
        height: window.devicePixelRatio * window.innerHeight,
    });
}

window.loadSkin = (...url) => worker && worker.postMessage({ skins: url });

window.onkeydown = event => {
    if((event.keyCode == 107 && event.ctrlKey == true) || 
       (event.keyCode == 109 && event.ctrlKey == true)) {
        event.preventDefault(); 
    }
}

const Mouse = {
    x: window.innerWidth  / 2,
    y: window.innerHeight / 2,
    scroll: 0,
    clicked: false
}

const wheelEvt = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
          document.onmousewheel !== undefined ? "mousewheel" :          // Webkit and IE support at least "mousewheel"
          "DOMMouseScroll";

window.addEventListener("mousemove", e => {
    Mouse.x = e.clientX;
    Mouse.y = e.clientY;
});

window.onmouseup = _ => Mouse.clicked = true;

window.addEventListener(wheelEvt, e => Mouse.scroll -= e.deltaY);

setInterval(() => {
    worker && worker.postMessage({ mouse: Mouse });
    Mouse.scroll = 0;
    Mouse.clicked = false;
}, 10);