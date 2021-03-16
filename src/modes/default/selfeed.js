/** @type {typeof import("../../physics/engine").DefaultSettings} */
module.exports = {
    TIME_SCALE: 1.2, // magic that make everything work like a certain ball game
    PLAYER_MAX_CELLS: 64,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_MERGE_TIME: 0,
    PLAYER_NO_MERGE_DELAY: 900,
    PLAYER_SPEED: 2,
    VIRUS_COUNT: 0,
    VIRUS_SIZE: 200,
    VIRUS_PUSH: true,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 85,
    EJECT_LOSS: 80,
    EJECT_DELAY: 100,
    BOTS: 5,
    BOT_SPAWN_SIZE: 1000,
    PELLET_COUNT: 5000,
    PLAYER_VIEW_SCALE: 1.2,
    PLAYER_SPAWN_SIZE: 1500,
    PLAYER_SPAWN_DELAY: 1500,
    PLAYER_MIN_SPLIT_SIZE: 150,
    PLAYER_MIN_EJECT_SIZE: 100,
    MAP_HW: 20000,
    MAP_HH: 20000,
    NORMALIZE_THRESH_MASS: 100000,
    PLAYER_SAFE_SPAWN_RADIUS: 1.2
};