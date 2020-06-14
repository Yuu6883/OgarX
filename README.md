# <strong> Ogar69 </strong>
Yeah it's OGAR 69
Nothing really works yet...

# Project Goals
* New protocol
* Specialized & optimized quadtree

## Protocol
Here's my analysis on the current commonly implemented protocol (by protocol I mean the cell packet since it's the core of the game and takes up most space). The protocol usually have 4 parts: (add, update, eat, delete) and each part is written sequentially and separated by a 16/32-bit 0. 

### Add and Update Packets
The add and update packet consist of the following fields:
* Cell Type: uint8
* Cell ID: uint32/uint64
* Player ID (if cell type is player cell): uint16/uint32
* Coordinate: int32/float32
* Size: uint16

After some simple calculation, we can find each player cell takes at least 1 + 4 + 2 + 4 + 4 + 2 = 17 bytes. Since most cells in the game should be player cells and assuming the server is sending 4096 cells to the client, we can calculate the bandwidth: 4096 * 17 bytes * 25Hz (common server update frequency) = 1.7MB/s! If the server has 100 player, that's a whooping 170MB/s. I'm not saying that the server can't handle it but it would burn through the vps bandwidth. What's more important is when the user has very slow connection / packet loss, their client will just freeze then suddenly receive all the packets causing a weird fast-forward animation since all the packets are read almost at once. Therefore I think it's important to have an efficient protocol to reduce bandwidth, reducing stress of both the server and the client. But how exactly can we reduce the size of the packet? It seems pretty compact already, but after giving some thoughts to it, I found some simple tricks to reduce it.

### Constant Values
* Cell type is in the packet for each update, but do we really need it? A cell's type doesn't change over time at all so we can just include it only in the initial packet. Same goes for the player id. We are already saving around 3 bytes (now packet size is 14bytes/cell) considering cells don't get added/removed **too** often.

### Value Ranges
* Map size is usually less than 65536 (2^16), so the position ranges from -32767 to 32767 and contained in an int16. We save another 4 bytes by doing so (now 10 bytes/cell). We could possibly change the range for cell id as well, but I will show a better way of doing it later in this writeup.

### Delta Compression
* This is a common practice in network coding to reduce bandwidth by using 1 bit indicating if the data is delta compressed, followed by actual value if not  compressed or delta value if compressed. This works especially well with ogar model. I profiled the delta in x, y, and size between 2 update packets for the same cell and figured that more than 80% of the time delta x, y, and size are within +-128 which means we only need 1 byte each variable to store the delta. But since we need to store the delta bit somewhere, I made this simple flag (1 byte, 8 bits) to store a little more than just 3 flags (delta bits for x, y, and size): `|is_delta_x|sign_x|ext_x|is_delta_y|sign_y|ext_y|is_delta_size|sign_size|`
    * `is_delta_x` indicates if x is delta compressed. Read 1 byte as delta x if is_delta_x is 1; else read 2 bytes as the actual x;
    * `sign_x` stores the sign bit of x
    * `ext_x` stores the extended bit of x. This expands range of delta x to -511 to +511 (10 bits) or actual x to -131072 to +131072 (18 bits).
    * The rest 5 bits shares the same idea, but size doesn't have an extended bit so delta only reanges from -255 to +255 which is good to cover most cases.

    Great now we are only using 6 bytes (id 2 bytes, delta flags 1 byte, x-y-size each 1 byte) in best case which is around 90% of time. 10% of time we have to use 3 extra bytes (9 btyes per cell) because delta bits are all 0.

#### Now you might think that's good enough already since we are only using around 50% of the original protocol.
But we can do **even better**.

### What if I tell you cell ID is not needed!?!?
Imagine we can just use array index as cell ID: Cell data at index 0 indicates the data (x,y,size) is for cell with id = 0. But you can see the problem quite easily: cell id keeps increasing and it's randomly sparsed during game play (server sends cells of id [0,69,420,69420] and you will need a lot of 0's in between). We could pad it with 0's and do some trick to reduce the number of 0's, but reading bit with offset can be tidious to implement, hard to debug, and increasing arithmetic calculations that might slow down the parsing. Then what would be a way to encode a sparsed array and not using bit-offset? The answer I can think of is: **octree**.

### Octree ID Compression
This data structure is usually used in 3D collision detection, but we are using it here to compress a sparsed array. The reason why I choose octree is just because 1 byte has 8 bits. Assume the client knows the size of sparsed array (aka the height of the octree), we can easily reconstruct the array from the tree. Here's how it would work:
* Suppose level = 1 (array length is 8) and first byte we read is `01100001`, then we need to parse 3 packets and those packets correspond to cell ids [1, 2, 7].
* A more complex example would be level = 2 (array length is 8^2 = 64 now) and the first byte we read is `10000001`. This indicates we have 2 children and their indices are at 0 and 7. Then we read 2 more bytes. Assume we got `10000000` and `00000001` which means the there're 2 packets and their cell id's are 0 and 63.

### Add Packets
These packets includes the necessary data to initialize the cell (cell id: uint32, player id: uint16, cell type: uint8, and the big 3: x-y-size). Player ID and cell type can be merged into 1 byte though, considering the server is most likely capping player number to something less than 250. And there's only 4 or 5 cell types, we can just encode them to special values in the byte: (e.g. Virus=255, Food=254, EjectedCell=253); 

### Delete and Eat Packets
These packets are simple: eat packet takes 8 bytes (cell id: uint32, eatenBy target: uint32), delete packet is just 4 bytes containing the id of the cell to delete.

### Putting Everything Together: <strong>Protocol 69</strong>
We can integrate the eat and delete packets into the octree compression, with 2 extra bits indicating the packet type. So we will only have 4 children instead of 8 in the lowest level. But wait! We have 5 states now (None, Add, Update, Eat, and Delete), and I only have 2 bits to encode the state. A simple solution is just to encode delete state as Eat(cell id, 0), so the state number is reduced to 4. For the diagram below, None=00, Add=01, Eat=10, Update=11.

### TL;DR
**Here's a demo on how it works**

This is relatively bad example since the octree nodes are taking 12 bytes, but if there're way more cells, it will stay the same compared to old protocol growing 4 more bytes per cell than protocol 69. Since this is just a writeup without actual implementation yet, I can only estimate the bandwidth save to be around 25% to 45%.

If you made it this far, congratulates! You must be a big fan of algorithm. Feel free to contact me (try to find me on Discord or something) if you think this protocol has flaws or you can improve it or you just want to discuss this with me.

## Quadtree Specialization & Optimization
Coming soon...