module.exports = class Chat {

    /** @param {import("../game")} game */
    constructor(game) {
        this.game = game;
    }

    broadcast(controller, message) {
        for (const other of this.game.controls) {
            if (other.handle) {
                other.handle.onChat(controller, message);
            }
        }
    }
}