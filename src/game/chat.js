module.exports = class Chat {

    /** @param {import(".")} game */
    constructor(game) {
        this.game = game;
    }

    /**
     * @param {import("./controller")} controller 
     * @param {string} message 
     */
    broadcast(controller, message) {
        for (const other of this.game.controls) {
            if (other.handle) other.handle.onChat(controller, message);
        }
    }
}