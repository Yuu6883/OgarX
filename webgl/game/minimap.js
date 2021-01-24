const SVG = "http://www.w3.org/2000/svg";
const PADDING = 25;

module.exports = class Minimap {
    /** @param {import("./hud")} hud */
    constructor(hud, dim = 512) {
        this.hud = hud;
        this.dim = dim;
        this.circles = document.getElementById("minimap").firstElementChild;
        this.texts = document.getElementById("minimap").lastElementChild;

        this.circles.setAttribute("viewBox", `${-PADDING} ${-PADDING} ${dim + PADDING} ${dim + PADDING}`);
        this.texts.setAttribute("viewBox", `${-PADDING} ${-PADDING} ${dim + PADDING} ${dim + PADDING}`);

        /** @type {Map<number, [SVGCircleElement, SVGTextElement]>} */
        this.nodes = new Map();
    }

    /** @param {Player[]} minimap */
    onData(minimap) {
        
        for (const [id, [circle, text]] of [...this.nodes.entries()]) {
            if (!minimap.some(p => p.id == id)) {
                circle.remove();
                text.remove();
                this.nodes.delete(id);
            }
        }

        for (const p of minimap) {

            let node = this.nodes.get(p.id);
            let circle = node && node[0];
            let text = node && node[1];

            if (!node) {
                circle = document.createElementNS(SVG, "circle");
                circle.classList.add("minimap-node");
                text = document.createElementNS(SVG, "text");
                text.classList.add("minimap-text");
                text.setAttribute("fill", "#eee");

                this.circles.appendChild(circle);
                this.texts.appendChild(text);

                this.nodes.set(p.id, [circle, text]);
            };

            text.textContent = p.name;
            text.setAttribute("x", p.x * this.dim);
            text.setAttribute("y", (1 - p.y) * this.dim - PADDING);

            circle.setAttribute("fill", p.me ? "#93a7e1" : "#eee");
            circle.setAttribute("r",  Math.max(Math.log2(p.score) / 2, 3) * 2);
            circle.setAttribute("cx", p.x * this.dim);
            circle.setAttribute("cy", (1 - p.y) * this.dim);
        }
    }
}

/** @typedef {{ x: number, y: number, score: number, name: string, skin: string, id: number }} Player */
