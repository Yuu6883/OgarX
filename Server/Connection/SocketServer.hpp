#pragma once

#pragma warning(push, 0)      
#include <uwebsockets/App.h>
#pragma warning(pop)

#include <list>
#include <thread>
#include <string_view>
#include "../Primitives/Config.hpp"

using std::list;
using std::pair;
using std::string;
using std::thread;
using std::string_view;

struct Game;
struct Player;
struct Minion;
struct PlayerBot;

enum class ErrorCode : short {
    NONE = 0,
    INVALID_IP = 4000,
    CONNECTION_MAXED,
    UNKNOWN_ORIGIN,
    IP_LIMITED
};

enum class  SocketServerState: unsigned char{
    OPEN, OPENING, CLOSE
};

struct SocketServer {
    SocketServer(Game* game) : game(game) {};
    bool open(unsigned int threads = 1);
    bool close();
    size_t thread_num() const { return socket_threads.size(); };
protected:
    Game* game;
    pair<ErrorCode, string> verify(unsigned int ipv4, string_view origin);

    list<Player*> clients;
    list<Minion*> minions;
    list<PlayerBot*> playerBots;

    SocketServerState state = SocketServerState::CLOSE;
    list<thread*> socket_threads;
    list<us_listen_socket_t*> us_sockets;
};