const Writer = require("./writer");

module.exports = class ChatChannel {
    constructor(game) {
        this.game = game;
    }

    broadcastMessage(controller, message) {
        for (var id in this.game.controls) {
            var Controller = this.game.controls[id];

            if (Controller.handle) {
                Controller.handle.onChatMsg(controller, message);
            }
        }
    }
}