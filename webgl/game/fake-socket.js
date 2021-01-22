module.exports = class FakeSocket {
    /** @param {MessagePort} port */
    constructor(port) {
        this.port = port;
        this.readyState = WebSocket.CONNECTING;

        port.onmessage = e => {
            const { data } = e;
            if (data.event === "message") {
                this.onmessage({ data: data.message });
            } else if (data.event === "error") {
                this.onerror({ message: data.message });
            } else if (data.event === "close") {
                this.onclose({ code: data.code, reason: data.reason });
            } else if (data.event === "open") {
                this.readyState = WebSocket.OPEN;
                this.onopen();
            }
        }
        port.start();
        this.onopen = this.onmessage = this.onerror = this.onclose = () => {};
    }

    /** @param {BufferSource} buffer */
    send(buffer) {
        this.port.postMessage({ event: "message", message: buffer }, [buffer]);
    }

    close() {
        this.port.postMessage({ event: "close", code: 1001, message: "Client closed connection" });
        this.port.close();

        this.readyState = WebSocket.CLOSED;
    }
}