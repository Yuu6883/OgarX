/** @type {typeof import("../../physics/engine").DefaultSettings} */
module.exports = {
    TIME_SCALE: 1.2, // magic that make everything work like a certain ball game
    PLAYER_MAX_CELLS: 64,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_MERGE_TIME: 5,
    VIRUS_COUNT: 50,
    VIRUS_SIZE: 150,
    VIRUS_PUSH: true,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 38,
    EJECT_LOSS: 38.2,
    EJECT_DELAY: 50,
    BOTS: 10,
    BOT_SPAWN_SIZE: 1000,
    EJECT_DISPERSION: 0,
    PELLET_COUNT: 10000,
    PLAYER_VIEW_SCALE: 1.2,
    PLAYER_SPAWN_SIZE: 500,
    PLAYER_SPAWN_DELAY: 1500,
    MAP_HW: 15000,
    MAP_HH: 15000,
    DUAL_ENABLED: true
};