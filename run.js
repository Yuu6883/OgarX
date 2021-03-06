const fs = require("fs");
const pm2 = require("pm2");
const path = require("path");

/** @type {pm2.StartOptions[]} */
const DefaultProcesses = [
    {
        name: "Server1",
        env: {
            OGARX_MODE: "default/mega",
            OGARX_PORT: 3000,
            OGARX_SERVER: "Megasplit",
            OGARX_ENDPOINT: "mega",
            OGARX_TOKEN: process.env.OGARX_TOKEN
        }
    }
];

/** @type {pm2.StartOptions[]} */
let config = null;

if (!fs.existsSync("config.json")) {
    fs.writeFileSync("config.json", JSON.stringify(DefaultProcesses, null, 4));
    config = DefaultProcesses;
} else {
    config = require("./config.json");
}

const validateMode = mode => fs.existsSync(path.resolve(__dirname, "src", "modes", `${mode}.js`));

const { GATEWAY_PORT, GATEWAY_ORIGIN } = process.env;

/** @type {pm2.StartOptions[]} */
const procToStart = [];

for (const proc of config) {
    proc.cwd = __dirname;
    proc.script = "./src/index.js";
    proc.max_memory_restart = "300M";
    proc.kill_timeout = 3000;

    if (validateMode(proc.env.OGARX_MODE)) {
        procToStart.push(proc);
    } else {
        console.warn(`Unable to find mode "${proc.env.OGARX_MODE}", aborting process "${proc.name}"`);
    }
}

pm2.connect(err => {
    if (err) return console.error("Failed to connect to pm2", err);
    pm2.start({
        name: "Gateway",
        cwd: __dirname,
        script: "./src/gateway.js",
        wait_ready: true,
        env: { GATEWAY_PORT, GATEWAY_ORIGIN }
    }, e => {
        if (e) console.error(e);
        else console.log("Gateway Process started");

        Promise.all(procToStart.map(proc => new Promise(res => {        
            pm2.start(proc, e => {
                if (e) console.error(e);
                else  console.log(`PM2 Process "${proc.name}" ` +
                    `(${proc.env.OGARX_MODE}-${proc.env.OGARX_SERVER}) mounted on ` +
                    `:${proc.env.OGARX_PORT || 443}/${proc.env.OGARX_ENDPOINT}`);
                res();
            });
        }))).then(() => process.exit(0));
    });
});