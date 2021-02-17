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
    void* next;
} CellData;

typedef struct {
    unsigned int flags;
    float x;
    float y;
    float size;
} RenderCell;

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
unsigned int bytes_per_render_cell() { return sizeof(RenderCell); }

extern void log_add(unsigned short id);
extern void print_list();
extern void list(float f);
extern void log_remove(unsigned int prev, unsigned int curr, unsigned int next);

void deserialize(CellData data[], unsigned short* packet) {

    CellData* curr = data->next;

    AddPacket* add_data = (AddPacket*) packet;

    while (add_data->id) {
        unsigned short id = add_data->id;
        CellData* cell = &data[id];

        cell->type = add_data->type;
        cell->oldX = cell->currX = cell->netX = add_data->x;
        cell->oldY = cell->currY = cell->netY = add_data->y;
        cell->oldSize = cell->currSize = cell->netSize = add_data->size;

        add_data++;

        // log_add(id);
        // Append this node before curr and set curr to this node
        if (!cell->next) {
            cell->next = curr;
            curr = cell;
        }
    }

    // Save the new head node to curr
    data->next = curr;
    
    // CellData* node = curr;
    // while (node) {
    //     list(node - data);
    //     node = node->next;
    // }
    // print_list();

    packet = (unsigned short*) add_data;
    packet++;

    UpdatePacket* update_data = (UpdatePacket*) packet;

    while (update_data->id) {
        unsigned short id = update_data->id;

        data[id].oldX = data[id].currX;
        data[id].oldY = data[id].currY;
        data[id].oldSize = data[id].currSize;
        data[id].netX = update_data->x;
        data[id].netY = update_data->y;
        data[id].netSize = update_data->size;

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
            data[eat_data->id].type = 0;
        }

        eat_data++;
    }

    packet = (unsigned short*) eat_data;
    packet++;

    DeletePacket* delete_data = (DeletePacket*) packet;

    while (delete_data->id) {
        data[delete_data->id].type = 0;
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

    // for (int i = 0; i < n; i++) list(cells[indices[i]].currSize);
    // print_list();
}

unsigned int update_cells(
    CellData data[],
    unsigned short indices[],
    float lerp, float t, float b, float l, float r, unsigned char skip) {

    lerp = lerp > 1 ? 1 : lerp < 0 ? 0 : lerp;

    unsigned int count = 0;

    // First node is always a placeholder
    CellData* prev = data;
    CellData* node = data->next;

    while (node) {

        if (node->type) {
            if (!node->netSize) {
                node->currX = lerp * (node->netX - node->currX) + node->currX;
                node->currY = lerp * (node->netY - node->currY) + node->currY;
                node->currSize = lerp * (node->netSize - node->currSize) + node->currSize;
                node->oldX += lerp / 2.0f;
                if (node->oldX >= 2.0f) node->type = 0;
            } else {
                node->currX = lerp * (node->netX - node->oldX) + node->oldX;
                node->currY = lerp * (node->netY - node->oldY) + node->oldY;
                node->currSize = lerp * (node->netSize - node->oldSize) + node->oldSize;
            }

            if (node->currX - node->currSize < r &&
                node->currX + node->currSize > l &&
                node->currY - node->currSize < t &&
                node->currY + node->currSize > b) {
                indices[count++] = node - data;
            }
        }
        
        // log_remove(prev - data, node - data, (CellData*) node->next - data);

        // Remove node
        if (!node->type) {
            void* temp = prev->next = node->next;
            node->next = NULL;
            node = temp;
        } else {
            prev = node;
            node = node->next;
        }
    }

    if (!skip) sort_indices(data, indices, count);

    unsigned char* types = (unsigned char*) (indices + count);

    for (unsigned int i = 0; i < count; i++)
        *types++ = data[indices[i]].type;

    return count;
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

unsigned int find_text_index(CellData data[], unsigned short indices[], unsigned int n, float cutoff) {
    for (unsigned int i = 0; i < n; i ++) {
        if (data[indices[i]].currSize > cutoff) return i;
    }
    return n;
}

unsigned short* serialize_state(CellData data[], AddPacket* packet) {

    CellData* node = data->next;
    while (node) {
        if (node->type && node->netSize) {
            packet->id = node - data;
            packet->type = node->type;
            packet->x = node->currX;
            packet->y = node->currY;
            packet->size = node->currSize;
            packet++;
        }
        node = node->next;
    }

    // Add padding 0 bytes for a valid packet
    unsigned short* end = (unsigned short*) packet;
    *end++ = 0;
    *end++ = 0;
    *end++ = 0;
    *end++ = 0;
    
    return end;
}
