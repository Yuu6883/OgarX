const DEFAULT = {
    zoom: 3,
    skin: 1,
    name: 1,
    mass: 1,
    draw: 120,
    quality: 0,
    auto_respawn: 0,
    skin_quality: 1,
    text_quality: 1,
    circle_quality: 1,
    ignore_skin: 0,
    mouse_sync: 0
};
const OPTION_KEYS = Object.keys(DEFAULT);

const MultiChoice = {
    skin: ["Disabled", "Enabled"],
    name: ["Disabled", "Enabled"],
    mass: ["Disabled", "Short", "Long"],
    quality: ["1080p", "720p", "480p"],
    auto_respawn: ["Disabled", "Enabled"],
    skin_quality: ["High", "Medium", "Low", "Laptop"],
    text_quality: ["High", "Medium", "Low", "Laptop"],
    circle_quality: ["High", "Medium", "Low", "Laptop"],
    ignore_skin: ["Disabled", "Enabled"],
    // mouse_sync: ["Disabled", "Enabled"]
}

module.exports = class Options {

    /** @param {import("./hud")} hud */
    constructor(hud) {
        this.hud = hud;

        try {
            /** @type {Object<string,number>} */
            const options = JSON.parse(localStorage.getItem("ogarx-options"));
            for (const k of OPTION_KEYS) 
                if (typeof options[k] !== "number") 
                    options[k] = DEFAULT[k];
            Object.assign(this.hud.state, options);
        } catch (e) {
            Object.assign(this.hud.state, DEFAULT);
        }

        for (const key in MultiChoice) {
            const elem = document.getElementById(`render-${key}`);
            elem.addEventListener("click", () => {
                const newIndex = this.hud.state[key] = (this.hud.state[key] + 1) % MultiChoice[key].length;
                elem.innerText = MultiChoice[key][newIndex];
                this.save();
                if (key == "quality") this.hud.resize();
            });
            elem.innerText = MultiChoice[key][this.hud.state[key]];
        }

        const slider = document.getElementById("render-delay-input");
        const display = document.getElementById("render-delay-display");

        const updateDrawDelay = () => {
            this.hud.state.draw = ~~slider.value;
            display.innerText = slider.value;
            this.save();
        }
        
        slider.addEventListener("change",    updateDrawDelay);
        slider.addEventListener("mousemove", updateDrawDelay);
        slider.value = this.hud.state.draw;
        updateDrawDelay();

        this.borders = [document.getElementById("border-color-1"), document.getElementById("border-color-2")];
        this.borders.forEach(b => b.addEventListener("change", () => this.updateBorderColors()));
        this.borders[0].value = localStorage.getItem("ogarx-border-1") || "#5779dd";
        this.borders[1].value = localStorage.getItem("ogarx-border-2") || "#e64ca6";
        this.updateBorderColors();
    }

    updateBorderColors() {
        this.hud.worker && this.hud.worker.postMessage({ dual: this.borders.map(b => b.value) });
        document.documentElement.style.setProperty('--border-color-1', this.borders[0].value);
        document.documentElement.style.setProperty('--border-color-2', this.borders[1].value);
        localStorage.setItem("ogarx-border-1", this.borders[0].value);
        localStorage.setItem("ogarx-border-2", this.borders[1].value);
    }

    get borderColors() { return this.borders.map(b => b.value); }

    save() {
        const obj = {};
        for (const key of OPTION_KEYS) obj[key] = this.hud.state[key];
        localStorage.setItem("ogarx-options", JSON.stringify(obj));
    }
}