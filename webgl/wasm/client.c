#include "memory.h"

#define EATEN_TYPE 251

typedef struct {
    unsigned int type;
    float oldX;
    float oldY;
    float oldSize;
    float currX;
    float currY;
    float currSize;
    float netX;
    float netY;
    float netSize;
} CellData;

typedef struct {
    unsigned short id;
    unsigned short type;
    short x;
    short y;
    unsigned short size;
} AddPacket;

typedef struct {
    unsigned short id;
    short x;
    short y;
    unsigned short size;
} UpdatePacket;

typedef struct {
    unsigned short id;
    unsigned short by;
} EatPacket;

typedef struct {
    unsigned short id;
} DeletePacket;

unsigned int bytes_per_cell_data() { return sizeof(CellData); }

void deserialize(CellData data[], unsigned short* packet) {

    AddPacket* add_data = (AddPacket*) packet;

    while (add_data->id) {
        unsigned short id = add_data->id;
        CellData* cell = &data[id];

        cell->type = add_data->type;
        cell->oldX = cell->currX = cell->netX = add_data->x;
        cell->oldY = cell->currY = cell->netY = add_data->y;
        cell->oldSize = cell->currSize = cell->netSize = add_data->size;
        
        add_data++;
    }

    packet = (unsigned short*) add_data;
    packet++;

    UpdatePacket* update_data = (UpdatePacket*) packet;

    while (update_data->id) {
        unsigned short id = update_data->id;

        if (data[id].type) {
            data[id].oldX = data[id].currX;
            data[id].oldY = data[id].currY;
            data[id].oldSize = data[id].currSize;
            data[id].netX = update_data->x;
            data[id].netY = update_data->y;
            data[id].netSize = update_data->size;
        }

        update_data++;
    }

    packet = (unsigned short*) update_data;
    packet++;

    EatPacket* eat_data = (EatPacket*) packet;

    while (eat_data->id) {
        
        if (data[eat_data->by].type) {
            data[eat_data->id].netX = data[eat_data->by].netX;
            data[eat_data->id].netY = data[eat_data->by].netY;

            data[eat_data->id].oldX = 0.0f;
            data[eat_data->id].oldY = 0.0f;
            data[eat_data->id].netSize = 0.0f;
        } else {
            memset(&data[eat_data->id], 0, sizeof(CellData));
        }

        eat_data++;
    }

    packet = (unsigned short*) eat_data;
    packet++;

    DeletePacket* delete_data = (DeletePacket*) packet;

    while (delete_data->id) {
        memset(&data[delete_data->id], 0, sizeof(CellData));
        delete_data++;
    }
}

void sort_indices(CellData cells[], unsigned short indices[], unsigned int n) {
    if (!n) return;
    
    int t = 0;

    // Build Max Heap
    for (int i = 1; i < n; i++) { 
        // if child is bigger than parent 
        if (cells[indices[i]].currSize > cells[indices[(i - 1) / 2]].currSize) {
            int j = i;
            // swap child and parent until parent is bigger 
            while (cells[indices[j]].currSize > cells[indices[(j - 1) / 2]].currSize) { 
                t = indices[j];
                indices[j] = indices[(j - 1) / 2];
                indices[(j - 1) / 2] = t;
                j = (j - 1) / 2; 
            }
        }
    }

    for (int i = n - 1; i > 0; i--) {
        // swap value of first indexed  
        // with last indexed  
        t = indices[0];
        indices[0] = indices[i];
        indices[i] = t;
        // maintaining heap property 
        // after each swapping 
        int j = 0, index;
        do { 
            index = (2 * j + 1); 
              
            // if left child is smaller than  
            // right child point index variable  
            // to right child 
            if (cells[indices[index]].currSize < cells[indices[index + 1]].currSize && 
                index < (i - 1)) index++; 
          
            // if parent is smaller than child  
            // then swapping parent with child  
            // having higher value 
            if (cells[indices[j]].currSize < cells[indices[index]].currSize && index < i) {
                t = indices[j];
                indices[j] = indices[index];
                indices[index] = t;
            }
            j = index; 
        } while (index < i); 
    }
}

unsigned int update_cells(
    CellData data[],
    unsigned short indices[],
    unsigned short pellet_indices[],
    float lerp, float t, float b, float l, float r, unsigned char skip) {

    lerp = lerp > 1 ? 1 : lerp < 0 ? 0 : lerp;

    unsigned short count = 0;
    unsigned short pellet_count = 0;

    CellData* end = &data[65536];
    CellData* node = data;

    while (node < end) {
        if (node->type) {
            if (!node->netSize) {
                node->currX = lerp * (node->netX - node->currX) + node->currX;
                node->currY = lerp * (node->netY - node->currY) + node->currY;
                node->currSize = lerp * (node->netSize - node->currSize) + node->currSize;
                node->oldX += lerp * 0.5f;
                if (node->oldX >= 2.0f) memset(node, 0, sizeof(CellData));
            } else {
                node->currX = lerp * (node->netX - node->oldX) + node->oldX;
                node->currY = lerp * (node->netY - node->oldY) + node->oldY;
                node->currSize = lerp * (node->netSize - node->oldSize) + node->oldSize;
            }

            if (node->type &&
                node->currX - node->currSize < r &&
                node->currX + node->currSize > l &&
                node->currY - node->currSize < t &&
                node->currY + node->currSize > b) {

                if (node->type == 254) {
                    pellet_indices[pellet_count++] = node - data;
                } else {
                    indices[count++] = node - data;
                }
            }
        }
        node++;
    }

    if (!skip) sort_indices(data, indices, count);

    unsigned char* types = (unsigned char*) (indices + count);

    for (unsigned int i = 0; i < count; i++)
        *types++ = data[indices[i]].type;

    return pellet_count | ((unsigned int) count << 16);
}

float* draw_cells(CellData data[], unsigned short indices[], unsigned int n, float* out) {
    for (unsigned int i = 0; i < n; i++) {
        CellData* cell = &data[indices[i]];
        float x = cell->currX;
        float y = cell->currY;
        float r = cell->currSize;

        float x0 = x - r;
        float x1 = x + r;
        float y0 = y - r;
        float y1 = y + r;

        // Triangle 1
        *out++ = x0;
        *out++ = y0;
        *out++ = x1;
        *out++ = y0;
        *out++ = x0;
        *out++ = y1;

        // Triangle 2
        *out++ = x1;
        *out++ = y0;
        *out++ = x0;
        *out++ = y1;
        *out++ = x1;
        *out++ = y1;
    }
    return out;
}

float* draw_pellets(CellData data[], unsigned short indices[], unsigned int n, float* out) {
    for (unsigned int i = 0; i < n; i++) {
        unsigned short id = indices[i];
        CellData* cell = &data[id];

        float x = cell->currX;
        float y = cell->currY;
        float r = cell->currSize;

        float x0 = x - r;
        float x1 = x + r;
        float y0 = y - r;
        float y1 = y + r;

        // Triangle 1
        *out++ = x0;
        *out++ = y0;
        *out++ = id;
        *out++ = x1;
        *out++ = y0;
        *out++ = id;
        *out++ = x0;
        *out++ = y1;
        *out++ = id;

        // Triangle 2
        *out++ = x1;
        *out++ = y0;
        *out++ = id;
        *out++ = x0;
        *out++ = y1;
        *out++ = id;
        *out++ = x1;
        *out++ = y1;
        *out++ = id;
    }
    return out;
}

unsigned char get_clicked_type(CellData data[], float x, float y) {
    
    CellData* end = &data[65536];
    CellData* node = data;

    unsigned char click_type = 0;
    float max_size = 0;

    while (node < end) {
        if (node->type && node->type <= 250 && 
            node->currSize > max_size &&
            (node->currX - x) * (node->currX - x) + 
                (node->currY - y) * (node->currY - y) < node->currSize * node->currSize) {
            max_size = node->currSize;
            click_type = node->type;
        }
        node++;
    }

    return click_type;
}

unsigned int find_text_index(CellData data[], unsigned short indices[], unsigned int n, float cutoff) {
    for (unsigned int i = 0; i < n; i ++)
        if (data[indices[i]].currSize > cutoff) return i;
    return n;
}

unsigned short* serialize_state(CellData data[], AddPacket* packet) {

    CellData* end = &data[65536];
    CellData* node = data;

    while (node < end) {
        if (node->type && node->netSize) {
            packet->id = node - data;
            packet->type = node->type;
            packet->x = node->currX;
            packet->y = node->currY;
            packet->size = node->currSize;
            packet++;
        }
        node++;
    }

    // Add padding 0 bytes for a valid packet
    unsigned short* ptr = (unsigned short*) packet;
    *ptr++ = 0;
    *ptr++ = 0;
    *ptr++ = 0;
    *ptr++ = 0;
    
    return ptr;
}
