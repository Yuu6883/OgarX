const Writer = require("./writer");

module.exports = class ChatChannel {
    constructor(game) {
        this.game = game;
    }

    broadcastMessage(handler, message) {
        /* Placing here to prevent possible extra memory usage of creating an array everytime? */
        var writer = new Writer();
        writer.writeUInt8(13);
        writer.writeUInt16(handler.controller.id);
        writer.writeUTF8String(message);

        writer = writer.finalize();

        for (var id in this.game.controls) {
            var Controller = this.game.controls[id];

            if (Controller.handle) {
                Controller.handle.onChatMsg(writer);
            }
        }
    }

    broadcastServerMessage(message) {
        /* Placing here to prevent possible extra memory usage of creating an array everytime? */
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