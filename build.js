const fs = require("fs");
const path = require("path");
const yargs = require("yargs");
const { hideBin } = require('yargs/helpers')
const browserify = require("browserify");
const minifier = require("babel-minify");

const MAIN_IN  = path.resolve(__dirname, "webgl", "game", "main.js");
const MAIN_OUT = path.resolve(__dirname, "public", "js", "main.min.js");

const RENDERER_IN  = path.resolve(__dirname, "webgl", "game", "renderer.js");
const RENDERER_OUT = path.resolve(__dirname, "public", "js", "renderer.min.js");

const LOADER_IN  = path.resolve(__dirname, "webgl", "game", "loader.js");
const LOADER_OUT = path.resolve(__dirname, "public", "js", "loader.min.js");

const CONTROL_IN  = path.resolve(__dirname, "webgl", "control", "control.js");
const CONTROL_OUT = path.resolve(__dirname, "public", "js", "control.min.js");

const SW_IN  = path.resolve(__dirname, "src", "worker.js");
const SW_OUT = path.resolve(__dirname, "public", "js", "sw.min.js");

/** @returns {Promise<string>} */
const streamToString = stream => {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    });
}

const argv = yargs(hideBin(process.argv))
    .option('renderer', {
        alias: 'r',
        type: 'boolean',
        description: 'Build renderer'
    })
    .option('sharedworker', {
        alias: 's',
        type: 'boolean',
        description: 'Build sharedworker'
    })
    .option('main', {
        alias: 'm',
        type: 'boolean',
        description: 'Build entry point'
    })
    .option('control', {
        alias: 'c',
        type: 'boolean',
        description: 'Build controller'
    })
    .option('loader', {
        alias: 'l',
        type: 'boolean',
        description: 'Build loader'
    })
    .option('all', {
        alias: 'a',
        type: 'boolean',
        description: 'Build all js files'
    })
    .argv;

(async () => {
    let code;
    let bundled = 0;
    
    if (argv.renderer || argv.all) {
        console.log("Building renderer"); bundled++;
        code = await streamToString(browserify(RENDERER_IN).bundle());
        fs.writeFileSync(RENDERER_OUT, minifier(code).code);
    }

    if (argv.sharedworker || argv.all) {
        console.log("Building sharedworker"); bundled++;
        code = await streamToString(browserify(SW_IN).bundle());
        fs.writeFileSync(SW_OUT, minifier(code).code);
    }

    if (argv.main || argv.all) {
        console.log("Building main"); bundled++;
        code = await streamToString(browserify(MAIN_IN).bundle());
        fs.writeFileSync(MAIN_OUT, minifier(code).code);
    }

    if (argv.control || argv.all) {
        console.log("Building web console"); bundled++;
        code = await streamToString(browserify(CONTROL_IN).bundle());
        fs.writeFileSync(CONTROL_OUT, minifier(code).code);
    }

    if (argv.loader || argv.all) {
        console.log("Building loader"); bundled++;
        code = await streamToString(browserify(LOADER_IN).bundle());
        fs.writeFileSync(LOADER_OUT, minifier(code).code);
    }

    if (!bundled) console.log("Nothing was bundled");
})();
