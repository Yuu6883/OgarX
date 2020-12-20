# <strong> Ogar69 </strong>
Yeah it's OGAR 69 pogchamp<br>
Server is working now, but need to start on the client (temp client scrapped from a certain game is in `/client`)

# Project Goals
* New protocol
* Specialized & optimized quadtree (mostly done)
* JS (instead of c++)
* Raw WebGL client

## WebGL Renderer

### Internal Buffer
[currX(4)|currY(4)|currSize(4)|oldX(4)|oldY(4)|oldSize(4)|netX(4)|netY(4)|netSize(4)|type(1)] -> 37 bytes per cell

### Render Buffer
[X(4)|Y(4)|size(4)|type(1)] -> 13 bytes
