(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
    worker.postMessage({ offscreen, 
        mouse: mouse.sharedBuffer, 
        viewport: viewport.sharedBuffer, 
        state: state.sharedBuffer,
        server: sharedServer.port
    }, [offscreen, sharedServer.port]);
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
},{"./mouse":2,"./state":3,"./viewport":4}],2:[function(require,module,exports){
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
module.exports = class State {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(4)) {
        this.sharedBuffer = buf;
        this.buffer = new Uint8Array(this.sharedBuffer);
    }

    get spectate() { return Atomics.load(this.buffer, 0); }
    set spectate(v) { Atomics.store(this.buffer, 0, v) }

    get splits() { return Atomics.load(this.buffer, 1); }
    set splits(v) { Atomics.add(this.buffer, 1, v); }

    get ejects() { return Atomics.load(this.buffer, 2); }
    set ejects(v) { Atomics.add(this.buffer, 2, v); }

    get macro() { return Atomics.load(this.buffer, 3); }
    set macro(v) { Atomics.store(this.buffer, 3, v); }

    exchange() {
        return {
            spectate: Atomics.exchange(this.buffer, 0, 0),
            splits: Atomics.exchange(this.buffer, 1, 0),
            ejects: Atomics.exchange(this.buffer, 2, 0),
            macro: this.macro
        }
    }
}
},{}],4:[function(require,module,exports){
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
