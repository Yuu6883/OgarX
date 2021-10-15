const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const uWS = require('uWebSockets.js');

/** @param {string} dir */
const walkDir = dir => {
    /** @type {string[]} */
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            /* Recurse into a subdirectory */
            results = results.concat(walkDir(file));
        } else {
            /* Is a file */
            results.push(file);
        }
    });
    return results;
};

// Load files into memory
const buffers = new Map();

const publicRoot = path.resolve(__dirname, 'public');

const dir = walkDir(publicRoot).map(f => f.replace(publicRoot, '').replace(/\\/g, '/'));
for (const f of dir) {
    buffers.set(f.replace(/\.html$/, '').replace(/\/index$/, '') || '/', {
        mime: mime.lookup(f),
        buffer: fs.readFileSync(path.resolve(publicRoot, ...f.split('/'))),
    });
}

uWS.App()
    .get('/*', (res, req) => {
        const url = req.getUrl();
        if (buffers.has(url)) {
            const { mime, buffer } = buffers.get(url);
            if (mime) res.writeHeader('content-type', mime);

            res.writeHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.writeHeader('Cross-Origin-Embedder-Policy', 'require-corp');

            if (mime === 'text/html') {
                res.writeHeader('cache-control', 's-maxage=0,max-age=60');
            } else {
                res.writeHeader('cache-control', 's-maxage=86400,max-age=86400');
            }
            res.end(buffer);
        } else {
            res.writeStatus('302');
            res.writeHeader('location', '/');
            res.end();
        }
    })
    .listen(8080, sock =>
        console.log(sock ? 'Serving on port 8080' : 'Failed to listen on port 8080'),
    );
