#include "Connection/SocketServer.hpp"

int main() {
	SocketServer server;
	server.open();

	string input;
	while (std::cin >> input && input != "exit") INFO("User entered: " << input);

	server.close();
	return EXIT_SUCCESS;
}