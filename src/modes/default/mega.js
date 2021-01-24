/** @type {typeof import("../../physics/engine").DefaultSettings} */
module.exports = {
    TIME_SCALE: 1.2, // magic that make everything work like a certain ball game
    PLAYER_MAX_CELLS: 64,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_MERGE_TIME: 3,
    VIRUS_COUNT: 150,
    VIRUS_SIZE: 200,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 38,
    EJECT_LOSS: 38.4,
    EJECT_DELAY: 50,
    BOTS: 100,
    BOT_SPAWN_SIZE: 1000,
    PELLET_COUNT: 5000,
    PLAYER_VIEW_SCALE: 1.3,
    PLAYER_SPAWN_SIZE: 1200,
    PLAYER_SPAWN_DELAY: 1500,
    MAP_HW: 30000,
    MAP_HH: 30000
};