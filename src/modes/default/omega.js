/** @type {typeof import("../../physics/engine").DefaultSettings} */
module.exports = {
    TIME_SCALE: 1.2, // magic that make everything work like a certain ball game
    PLAYER_MAX_CELLS: 369,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_MERGE_TIME: 5,
    VIRUS_COUNT: 20,
    VIRUS_SIZE: 200,
    VIRUS_PUSH: true,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 38,
    EJECT_LOSS: 38.4,
    EJECT_DELAY: 100,
    BOTS: 50,
    BOT_SPAWN_SIZE: 1000,
    PELLET_COUNT: 5000,
    PLAYER_VIEW_SCALE: 1.1,
    PLAYER_SPAWN_SIZE: 500,
    PLAYER_SPAWN_DELAY: 1500,
    PLAYER_MIN_SPLIT_SIZE: 150,
    PLAYER_NO_COLLI_DELAY: 550,
    PLAYER_NO_EJECT_DELAY: 250,
    MAP_HW: 26000,
    MAP_HH: 26000,
    STATIC_DECAY: 1,
    DYNAMIC_DECAY: 1,
    DECAY_MIN: 800,
    NORMALIZE_THRESH_MASS: 100000,
    DUAL_ENABLED: true,
    PLAYER_SAFE_SPAWN_RADIUS: 1.2
};