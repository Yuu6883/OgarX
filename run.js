const fs = require("fs");
const pm2 = require("pm2");

/** @type {pm2.StartOptions[]} */
const DefaultProcesses = [
    {
        name: "Server1",
        script: "./src/index.js",
        cwd: __dirname,
        max_memory_restart: "500M",
        kill_timeout: 3000,
        env: {
            OGARX_MODE: "default/mega",
            OGARX_PORT: 3000,
            OGARX_SERVER: "Megasplit",
            OGARX_ENDPOINT: "/mega",
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

for (const proc of config) {
    console.log(`PM2 Process "${proc.name}" (${proc.env.OGARX_MODE}-${proc.env.OGARX_SERVER}) is mounted on ` +
        `:${proc.env.OGARX_PORT || 443}${proc.env.OGARX_ENDPOINT || "/"}`);
}

pm2.connect(err => {
    if (err) return console.error(err);
    pm2.start(config, e => e ? console.error(e) : process.exit(0));
});