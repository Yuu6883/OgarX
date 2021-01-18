/** @type {typeof import("../../physics/engine").DefaultSettings} */
module.exports = {
    VIRUS_COUNT: 100,
    PLAYER_MAX_CELLS: 200,
    PLAYER_MERGE_NEW_VER: true,
    // PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_MERGE_TIME: 5,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 38,
    EJECT_LOSS: 41,
    EJECT_DELAY: 80,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 1500,
    MAP_HW: 32767 >> 2, // MAX signed short
    MAP_HH: 32767 >> 2, // MAX signed short,
};