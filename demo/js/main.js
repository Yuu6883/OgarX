(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
},{"./mouse":2,"./viewport":3}],2:[function(require,module,exports){
module.exports = class Mouse {
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
    
    updateScroll(v) { Atomics.add(this.buffer, 2, v); }
    resetScroll() { return Atomics.exchange(this.buffer, 2, 0); }
}
},{}],3:[function(require,module,exports){
module.exports = class Viewport {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(8)) {
        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get width() { return Atomics.load(this.buffer, 0); }
    set width(v) { Atomics.store(this.buffer, 0, v) }

    get height() { return Atomics.load(this.buffer, 1); }
    set height(v) { Atomics.store(this.buffer, 1, v); }
}
},{}]},{},[1]);
