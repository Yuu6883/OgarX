module.exports = class Handle {
    constructor() {
        /** @type {import("./controller")} */
        this.controller = null; 
    };
    onUpdate() {};
    /** @param {string} err */
    onError(err) {};
}