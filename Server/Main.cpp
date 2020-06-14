#include "Game/World.hpp"
#include "Connection/SocketServer.hpp"

int main() {
	SocketServer server;
	server.open();

	World world;

	world.update();

	string input;
	while (std::cin >> input && input != "exit") INFO("User entered: " << input);

	server.close();
	return EXIT_SUCCESS;
}