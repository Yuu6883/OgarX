const fs = require("fs");
const path = require("path");

const DefaultFolder = path.resolve(__dirname, "default");
const CustomFolder = path.resolve(__dirname, "custom");

if (!fs.existsSync(CustomFolder)) fs.mkdirSync(CustomFolder);

/** @type {Map<string, typeof import("../physics/engine").DefaultSettings>} */
const GameModes = new Map();

for (const file of fs.readdirSync(DefaultFolder)) {
    try {
        GameModes.set(`default/${file.replace(/\.js$/, "")}`, require(`./default/${file}`));
    } catch (e) {
        console.error(`Failed to load default gamemode from "${file}"`);
    }
}

for (const file of fs.readdirSync(CustomFolder)) {
    try {
        GameModes.set(`custom/${file.replace(/\.js$/, "")}`, require(`./custom/${file}`));
    } catch (e) {
        console.error(`Failed to load custom gamemode from "${file}"`);
    }
}

GameModes.set("default", {});

module.exports = GameModes;