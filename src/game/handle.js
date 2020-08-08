module.exports = class Handle {
    /** @param {import("./controller")} controller */
    constructor(controller) { this.controller = controller; controller.handle = this; };
    onUpdate() {};
    onDead() {};
}