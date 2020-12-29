window.onload = () => {
    const sharedServer = new SharedWorker("js/sw.min.js#server", "ogar-x-server");
    sharedServer.onerror = console.error;
    const port = sharedServer.port;
};