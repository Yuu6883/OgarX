/** @returns {Promise<IDBDatabase>} */
module.exports = () => new Promise((resolve, reject) => {
    const req = indexedDB.open("ogar69-replay");
    req.onupgradeneeded = e => {
        console.log("Creating replay object store");
        /** @type {IDBDatabase} */
        const db = e.target.result;
        db.createObjectStore("replay-meta");
        db.createObjectStore("replay-data");
    }
    req.onsuccess = _ => resolve(req.result);
    req.onerror = reject;
});