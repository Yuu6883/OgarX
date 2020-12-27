module.exports = class FakeSocket {
    /** @param {MessagePort} port */
    constructor(port) {
        this.port = port;
        this.readyState = WebSocket.OPEN;

        port.onmessage = e => {
            const { data } = e;
            if (data.event === "message") {
                this.onmessage(new DataView(data.message));
            } else if (data.event === "close") {
                this.onclose({ code: data.code, reason: data.message });
            }
        }

        port.start();
        port.postMessage({ event: "open" });

        this.subscribe = this.onmessage = this.onclose = () => {};
    }

    /** @param {BufferSource} buffer */
    send(buffer) {
        this.port.postMessage({ event: "message", message: buffer }, [buffer]);
    }

    end(code = 1006, reason = "") {
        this.port.postMessage({ event: "close", code, reason });
    }
}