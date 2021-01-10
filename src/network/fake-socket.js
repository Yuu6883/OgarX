module.exports = class FakeSocket {
    /** @param {MessagePort} port */
    constructor(port) {
        port.ws = this;
        this.port = port;
        this.readyState = WebSocket.OPEN;

        port.onmessage = e => {
            const { data } = e;
            if (data.event === "message") {
                this.onmessage(data.message);
            } else if (data.event === "close") {
                this.onclose({ code: data.code, reason: data.message });
            }
        }

        port.start();

        this.subscribe = this.onmessage = this.onclose = () => {};
        /** @type {import("./protocol")} */
        this.p = null;
    }

    /** @param {BufferSource} buffer */
    send(buffer) {
        this.port.postMessage({ event: "message", message: buffer }, [buffer]);
    }

    end(code = 1006, reason = "") {
        this.port.postMessage({ event: "close", code, reason });
        this.port.close();
        this.onclose(code, reason);
    }
}