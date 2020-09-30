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

    broadcastServerMessage(message) {
        var writer = new Writer();
        writer.writeUInt8(13);
        writer.writeUInt8(0);
        writer.writeUTF8String(message);

        writer = writer.finalize();

        for (var id in this.game.controls) {
            var Controller = this.game.controls[id];

            if (Controller.handle) {
                Controller.handle.onChatMsg(writer);
            };
        };
    }
}