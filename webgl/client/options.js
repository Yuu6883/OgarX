const DEFAULT = {
    zoom: 3,
    skin: 1,
    name: 1,
    mass: 1,
    draw: 120
};
const OPTION_KEYS = Object.keys(DEFAULT);

const MultiChoice = {
    skin: ["Disabled", "Enabled"],
    name: ["Disabled", "Enabled"],
    mass: ["Disabled", "Short", "Long"]
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
        
        slider.addEventListener("change", updateDrawDelay);
        slider.addEventListener("mousemove", updateDrawDelay);
        slider.value = this.hud.state.draw;
        updateDrawDelay();
    }

    save() {
        const obj = {};
        for (const key of OPTION_KEYS) obj[key] = this.hud.state[key];
        localStorage.setItem("ogarx-options", JSON.stringify(obj));
    }
}