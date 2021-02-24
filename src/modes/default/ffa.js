/** @type {typeof import("../../physics/engine").DefaultSettings} */
module.exports = {
    TIME_SCALE: 1.2, // magic that make everything work like a certain ball game
    PLAYER_MAX_CELLS: 16,
    PLAYER_MERGE_NEW_VER: false,
    PLAYER_MERGE_TIME: 20,
    VIRUS_COUNT: 50,
    VIRUS_SIZE: 100,
    VIRUS_MONOTONE_POP: false,
    VIRUS_PUSH: false,
    EJECT_SIZE: 40,
    EJECT_LOSS: 43,
    EJECT_DELAY: 150,
    EJECT_MAX_AGE: 30 * 1000, // 30 seconds
    BOTS: 15,
    BOT_SPAWN_SIZE: 700,
    PELLET_COUNT: 5000,
    PELLET_SIZE: 20,
    PLAYER_VIEW_SCALE: 1.3,
    PLAYER_SPAWN_SIZE: 200,
    PLAYER_SPAWN_DELAY: 1500,
    DECAY_MIN: 1000,
    MAP_HW: 8000,
    MAP_HH: 8000,
    DUAL_ENABLED: true
};