#pragma once

#pragma warning(push, 0)      
#include <uwebsockets/App.h>
#pragma warning(pop)
#include <nlohmann/json.hpp>

#include "Geometry.hpp"
#include "Logger.hpp"

#include <map>
#include <vector>
#include <iomanip>
#include <fstream>
#include <functional>

using std::map;
using std::string;
using std::vector;
using std::ifstream;
using std::ofstream;
using std::function;
using std::to_string;

using JSON = nlohmann::json;

static inline JSON JSON_CONFIG = R"(
{
    "socket": {
        "port": 3000,
        "originRegex": ".*",
        "maxConnections": 100,
        "maxConnectionsPerIP": 2,
        "ssl": false
    },
    "ssl_options": {
        "key_file_name": "",
	    "cert_file_name": "",
	    "passphrase": "",
	    "dh_params_file_name": "",
	    "ca_file_name": "",
        "ssl_prefer_low_memory_usage": 0
    },
    "game": {
        "name": "An unnamed server",
        "mode": "FFA",
        "threads": 1,
        "frequency": 25
    },
    "spawn": {
        "protection": 40,
        "tries": 128,
        "decreasePerTry": false,
        "fromEjectedChance": 0.8
    },
    "oversize": {
        "kill": false,
        "restart": true,
        "multi": 0.75
    },
    "border": {
        "w": 7071,
        "h": 7071
    },
    "quadtree": {
        "maxLevel": 16,
        "maxItems": 16
    },
    "chat": {
        "enabled": true,
        "cooldown": 1000,
        "maxLength": 64,
        "filter": []
    },
    "player": {
        "spawn": 32,
        "count": 1024,
        "dispose": 100,
        "nameLength": 16,
        "allowSkinInName": true,
        "eatMulti": 1.140175425099138,
        "eatOverlapDiv": 3,
        "autoSize": 1500,
        "minSplitSize": 60,
        "minEjectSize": 60,
        "splitCap": 255,
        "ejectDelay": 2,
        "maxCells": 16,
        "moveMult": 1,
        "splitSizeDiv": 1.414213562373095,
        "splitDistance": 40,
        "splitBoost": 780,
        "noCollideDelay": 14,
        "noMergeDelay": 0.5,
        "mergeNewVersion": false,
        "mergeTime": 30,
        "mergeTimeIncrease": 0.02,
        "decayMult": 0.001,
        "decayMin": 1500
    },
    "bot": {
        "spawn": 32,
        "count": 0,
        "names": [],
        "skins": []
    },
    "minion": {
        "spawn": 32,
        "count": 0
    },
    "pellet": {
        "count": 100,
        "alloc": 65536,
        "size": 10
    },
    "virus": {
        "count": 30,
        "alloc": 65536,
        "size": 100,
        "feedTimes": 7,
        "pushing": false,
        "boost": 780,
        "monotone":false
    },
    "ejected": {
        "count": 30,
        "alloc": 65536,
        "size": 38,
        "loss": 43,
        "dispersion": 0.3,
        "boost": 780
    },
    "mothercell": {
        "count": 0,
        "alloc": 1024,
        "size": 149,
        "tick": 20,
        "speed": 1,
        "boost": 90,
        "pellets": 96
    },
    "viewport": {
        "roamSpeed": 32,
        "roamScale": 0.4,
        "viewScale": 1,
        "viewMin": 1
    }
}
)"_json;

static const char* CONFIG_PATH = "config.json";

struct SocketServerConfig {
    unsigned int port = 3000;
    string originRegex = ".*";
    unsigned int maxConnections = 100;
    unsigned int maxConnectionsPerIP = 2;
    bool ssl = false;
};

struct SSLConfig {
    string key_file_name;
    string cert_file_name;
    string passphrase;
    string dh_params_file_name;
    string ca_file_name;
    int ssl_prefer_low_memory_usage = 0;
    us_socket_context_options_t operator()() {
        return { key_file_name.c_str(), cert_file_name.c_str(), \
            passphrase.c_str(), dh_params_file_name.c_str(), ca_file_name.c_str(), ssl_prefer_low_memory_usage };
    }
};

struct GameServerConfig {
    string name = "An unnamed server";
    string mode = "FFA";
    unsigned int threads = 1;
    unsigned int frequency = 25;
};

struct SpawnConfig {
    unsigned int protection = 40;
    unsigned int tries = 128;
    bool decreasePerTry = false;
    float fromEjectedChance = 0.8f;
};

struct OversizeConfig {
    bool kill = false;
    bool restart = true;
    float multi = 0.75f;
};

struct QuadTreeConfig {
    unsigned int maxLevel = 16;
    unsigned int maxItems = 16;
};

struct ChatConfig {
    bool enabled = true;
    unsigned int cooldown = 1000;
    unsigned int maxLength = 64;
    vector<string> filter;
};

struct SpawnableConfig {
    float spawn = 32;
    unsigned int count = 0;
};

struct PlayerConfig : SpawnableConfig {
    unsigned int nameLength = 16;
    bool allowSkinInName = true;
    unsigned int dispose = 100;
    float eatMulti = 1.140175425099138f;
    float eatOverlapDiv = 3.0f;
    float autoSize = 1500.0f;
    float minSplitSize = 60;
    float minEjectSize = 60;
    unsigned int splitCap = 255;
    unsigned int ejectDelay = 2;
    unsigned maxCells = 16;
    float moveMult = 1;
    float splitSizeDiv = 1.414213562373095f;
    float splitDistance = 40;
    float splitBoost = 780;
    unsigned int noCollideDelay = 14;
    float noMergeDelay = 0.5f;
    bool mergeNewVersion = false;
    unsigned int mergeTime = 30;
    float mergeTimeIncrease = 0.02f;
    float decayMult = 0.001f;
    float decayMin = 1500.0f;
};

struct BotConfig : SpawnableConfig {
    vector<string> names;
    vector<string> skins;
};

struct MinionConfig : SpawnableConfig {};

struct BufferableConfig {
    unsigned int count;
    unsigned int alloc;
    float size;
};

struct PelletConfig : BufferableConfig {};

struct VirusConfig : BufferableConfig {
    unsigned int feedTimes = 7;
    bool pushing = false;
    float boost = 780;
    bool monotone = false;
};

struct EjectedConfig : BufferableConfig {
    float loss = 38.0f;
    float dispersion = 0.3f;
    float boost = 780;
};

struct MotherCellConfig : BufferableConfig {
    unsigned int tick = 20;
    float speed = 1.0f;
    float boost = 90.0f;
    unsigned int pellets = 90;
};

struct ViewportConfig {
    float roamSpeed = 32.0f;
    float roamScale = 0.4f;
    float viewScale = 1.0f;
    float viewMin = 1.0f;
};

#define str(s) #s
#define R(sub, attr, type) { auto value = read ## type ## (#sub, #attr); if (sub.attr != value) { sub.attr = value; trigger(str(sub-attr)); } }
#define R_Str(sub, attr) sub.attr = readString(#sub, #attr)
#define R_Bool(sub, attr) R(sub, attr, Bool)
#define R_UInt(sub, attr) R(sub, attr, UInt)
#define R_Float(sub,attr) R(sub, attr, Float)
#define R_SArr(sub, attr) readStringArray(#sub, #attr, sub.attr)

inline struct GlobalConfig {

    SocketServerConfig socket;
    SSLConfig ssl_options;
    GameServerConfig game;
    SpawnConfig spawn;
    OversizeConfig oversize;
    Rect border;
    QuadTreeConfig quadtree;
    ChatConfig chat;
    PlayerConfig player;
    BotConfig bot;
    MinionConfig minion;
    PelletConfig pellet;
    VirusConfig virus;
    EjectedConfig ejected;
    MotherCellConfig mothercell;
    ViewportConfig viewport;

    GlobalConfig() {
        try {

            ifstream config_in(CONFIG_PATH);

            if (config_in.is_open() && config_in.good()) {
                INFO("Reading config from " << CONFIG_PATH);

                config_in >> JSON_CONFIG;
                config_in.close();
            } else {
                INFO("Writing default config to " << CONFIG_PATH);

                ofstream config_out(CONFIG_PATH);
                config_out << std::setw(4) << JSON_CONFIG << std::endl;
                config_out.close();
            }

            /* SSL options should only be read once */
            R_Str(ssl_options, key_file_name);
            R_Str(ssl_options, cert_file_name);
            R_Str(ssl_options, passphrase);
            R_Str(ssl_options, dh_params_file_name);
            R_Str(ssl_options, ca_file_name);
            R_UInt(ssl_options, ssl_prefer_low_memory_usage);

            reload();
        } catch (std::exception& e) {
            ERROR(e.what());
        }
    }

    void reload() {
        R_UInt(socket, port);
        R_Str(socket, originRegex);
        R_UInt(socket, maxConnections);
        R_UInt(socket, maxConnectionsPerIP);
        R_Bool(socket, ssl);

        R_Str(game, name);
        R_Str(game, mode);
        R_UInt(game, threads);
        R_UInt(game, frequency);

        R_UInt(spawn, protection);
        R_UInt(spawn, tries);
        R_Bool(spawn, decreasePerTry);
        R_Float(spawn, fromEjectedChance);

        R_Bool(oversize, kill);
        R_Bool(oversize, restart);
        R_Float(oversize, multi);

        R_Float(border, w);
        R_Float(border, h);

        R_UInt(quadtree, maxLevel);
        R_UInt(quadtree, maxItems);

        R_Bool(chat, enabled);
        R_UInt(chat, cooldown);
        R_UInt(chat, maxLength);
        R_SArr(chat, filter);

        R_Float(player, spawn);
        R_UInt(player, count);
        R_UInt(player, dispose);
        R_UInt(player, nameLength);
        R_Float(player, eatMulti);
        R_Float(player, eatOverlapDiv);
        R_Float(player, autoSize);
        R_Float(player, minSplitSize);
        R_Float(player, minSplitSize);
        R_UInt(player, splitCap);
        R_UInt(player, ejectDelay);
        R_UInt(player, maxCells);
        R_Float(player, moveMult);
        R_Float(player, splitSizeDiv);
        R_Float(player, splitDistance);
        R_Float(player, splitBoost);
        R_UInt(player, noCollideDelay);
        R_Float(player, noMergeDelay);
        R_Bool(player, mergeNewVersion);
        R_UInt(player, mergeTime);
        R_Float(player, mergeTimeIncrease);
        R_Float(player, decayMult);
        R_Float(player, decayMin);

        R_Float(bot, spawn);
        R_UInt(bot, count);
        R_SArr(bot, names);
        R_SArr(bot, skins);

        R_Float(minion, spawn);
        R_UInt(minion, count);

        R_UInt(pellet, count);
        R_UInt(pellet, alloc);
        R_Float(pellet, size);

        R_UInt(virus, count);
        R_UInt(virus, alloc);
        R_Float(virus, size);
        R_UInt(virus, feedTimes);
        R_Bool(virus, pushing);
        R_Float(virus, boost);
        R_Bool(virus, monotone);

        R_UInt(ejected, count);
        R_UInt(ejected, alloc);
        R_Float(ejected, size);
        R_Float(ejected, loss);
        R_Float(ejected, dispersion);
        R_Float(ejected, boost);

        R_UInt(mothercell, count);
        R_UInt(mothercell, alloc);
        R_Float(mothercell, size);
        R_UInt(mothercell, tick);
        R_Float(mothercell, speed);
        R_Float(mothercell, boost);
        R_UInt(mothercell, pellets);

        R_Float(viewport, roamSpeed);
        R_Float(viewport, roamScale);
        R_Float(viewport, viewScale);
        R_Float(viewport, viewMin);
    }

    void on(string event, function<void(void)> callback) {
        off(event);
        events.insert(std::make_pair(event, callback));
    }

    void off(string event) {
        auto iter = events.find(event);
        if (iter != events.end()) events.erase(iter);
    }

protected:

    map<string, function<void(void)>> events;

    bool readBool(const char* key, const char* attr) {
        bool value = false;
        if (!JSON_CONFIG[key].is_object() || !JSON_CONFIG[key][attr].is_boolean()) {
            WARN("Failed to read bool from config (key: " << key << ", attribute: " << attr << ")");
        } else {
            value = JSON_CONFIG[key][attr];
        }
        return value;
    }

    unsigned int readUInt(const char* key, const char* attr) {
        unsigned int value = 0;
        if (!JSON_CONFIG[key].is_object() || !JSON_CONFIG[key][attr].is_number_unsigned()) {
            WARN("Failed to read unsigned int from config (key: " << key << ", attribute: " << attr << ")");
        } else {
            value = JSON_CONFIG[key][attr];
        }
        return value;
    }

    float readFloat(const char* key, const char* attr) {
        float value = 0;
        if (JSON_CONFIG[key].is_object() && JSON_CONFIG[key][attr].is_number_integer()) {
            value = JSON_CONFIG[key][attr];
        } else if (JSON_CONFIG[key].is_object() && JSON_CONFIG[key][attr].is_number_float()) {
            value = JSON_CONFIG[key][attr];
        } else {
            WARN("Failed to read float from config (key: " << key << ", attribute: " << attr << ")");
        }
        return value;
    }

    string readString(const char* key, const char* attr) {
        string value = "";
        if (JSON_CONFIG[key].is_object() && JSON_CONFIG[key][attr].is_string()) {
            value = JSON_CONFIG[key][attr];
        } else {
            WARN("Failed to read string from config (key: " << key << ", attribute: " << attr << ")");
        }
        return value;
    }

    void readStringArray(const char* key, const char* attr, vector<string>& dist) {
        dist.clear();
        if (!JSON_CONFIG[key].is_object() || !JSON_CONFIG[key][attr].is_array()) {
            WARN("Failed to read string array from config (key: " << key << ", attribute: " << attr << ")");
            return;
        }
        for (auto item : JSON_CONFIG[key][attr]) {
            if (item.is_string())
                dist.push_back(item);
            else
                WARN("Failed to read item as string " << item << \
                    " from config (key: " << key << ", attribute: " << attr << ")");
        }
    }

    void trigger(string event) {
        auto iter = events.find(event);
        if (iter == events.end()) return;
        iter->second();
    }

} CFG;

#undef str
#undef R
#undef R_Bool
#undef R_UInt
#undef R_Float
#undef R_SArr
