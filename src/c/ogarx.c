#include "memory.h"

// Memory layout
// |64kb last visible hash table|64kb visible hash table
// |list of last visible cell indices (unsigned short)|list of visible cell indices (unsigned short)
// | dynamic buffer (A/U/E/D buffer + serialized buffer)

// Protocol onUpdate:
// 1. Copy current visible hash table into last table, fill current one with 0 (move_hashtable)
// 2. Copy current visible list into last list
// 3. Write indices of A/U/E/D cells (Add/Update/Eat/Delete)
// 4. Build final buffer (serialize)

#define PELLET_TYPE 254
#define TABLE_SIZE 65536

extern short get_cell_x(void* ptr, unsigned short id);
extern short get_cell_y(void* ptr, unsigned short id);
extern unsigned short get_cell_r(void* ptr, unsigned short id);
extern unsigned short get_cell_eatenby(void* ptr, unsigned short id);
extern unsigned char  get_cell_type(void* ptr, unsigned short id);

// Step 1
void move_hashtable() {
    memcpy((void *) 0, (void *) TABLE_SIZE, TABLE_SIZE);
    memset((void *) TABLE_SIZE, 0, TABLE_SIZE);
}

// Step 2 (from high to low, it actually copies per byte, so overlapping is fine)
void copy(void* dist, void* src, size_t bytes) {
    memcpy(dist, src, bytes);
}

// Step 3 write AUED indices
void* write_AUED(
    unsigned char last_visible_table[], unsigned char curr_visible_table[],
    unsigned short last_visible_list[], unsigned int last_visible_list_length,
    unsigned short curr_visible_list[], unsigned int curr_visible_list_length,
    unsigned int count_table[], unsigned short dist[]) {

    // Write current visible cells to the hash table
    for (unsigned int i = 0; i < curr_visible_list_length; i++)
        curr_visible_table[curr_visible_list[i]] = 1;

    unsigned short* A_ptr = dist + 0;
    unsigned short* U_ptr = dist + 1;
    unsigned short* E_ptr = dist + 2;
    unsigned short* D_ptr = dist + 3;

    // The algorithm is the same as original ogar protocol
    for (unsigned int i = 0; i < curr_visible_list_length; i++) {
        unsigned short cell_id = curr_visible_list[i];
        if (last_visible_table[cell_id]) {
            if (get_cell_type(0, cell_id) != PELLET_TYPE) {
                *U_ptr = cell_id;
                U_ptr += 4;
            }
        } else {
            *A_ptr = cell_id;
            A_ptr += 4;
        }
    }

    for (unsigned int i = 0; i < last_visible_list_length; i++) {
        unsigned short cell_id = last_visible_list[i];
        if (curr_visible_table[cell_id]) continue;
        unsigned short eatenby = get_cell_eatenby(0, cell_id);
        if (eatenby) {
            *E_ptr = cell_id;
            E_ptr += 4;
        } else {
            *D_ptr = cell_id;
            D_ptr += 4;
        }
    }

    // Save the write count to the table
    count_table[0] = (A_ptr - (dist + 0)) >> 2;
    count_table[1] = (U_ptr - (dist + 1)) >> 2;
    count_table[2] = (E_ptr - (dist + 2)) >> 2;
    count_table[3] = (D_ptr - (dist + 3)) >> 2;

    unsigned short* end = A_ptr;
    end = U_ptr > end ? U_ptr : end;
    end = E_ptr > end ? E_ptr : end;
    end = D_ptr > end ? D_ptr : end;

    return end;
}

// Marco god is flexing on you
#define writeUint8(v) *((unsigned char*) dist) = v; dist++
#define writeUint16(v) *((unsigned short*) dist) = v; dist += 2
#define writeInt16(v) *((short*) dist) = v; dist += 2
#define writeFloat32(v) *((float *) dist) = v; dist += 4

// Step 4
unsigned char* serialize(
    unsigned char cell_count,
    unsigned char line_lock,
    float vx, float vy,
    unsigned int table[],
    unsigned short* lists, unsigned char* dist) {

    // Write OP code
    writeUint8(4);
    // Write cell count and line lock (booleans)
    writeUint8(cell_count);
    writeUint8(line_lock);
    // Write viewport floats
    writeFloat32(vx);
    writeFloat32(vy);

    // Initialize read pointers for AUED
    unsigned int A_count = table[0];
    unsigned int U_count = table[1];
    unsigned int E_count = table[2];
    unsigned int D_count = table[3];

    unsigned short* A_ptr = lists + 0;
    unsigned short* U_ptr = lists + 1;
    unsigned short* E_ptr = lists + 2;
    unsigned short* D_ptr = lists + 3;
    
    // Exact same serialization
    while (A_count--) {
        unsigned short cell_id = *A_ptr;

        writeUint16(cell_id);
        writeUint16(get_cell_type(0, cell_id));
        writeInt16(get_cell_x(0, cell_id));
        writeInt16(get_cell_y(0, cell_id));
        writeUint16(get_cell_r(0, cell_id));

        A_ptr += 4;
    }

    writeUint16(0);

    while (U_count--) {
        unsigned short cell_id = *U_ptr;

        writeUint16(cell_id);
        writeInt16(get_cell_x(0, cell_id));
        writeInt16(get_cell_y(0, cell_id));
        writeUint16(get_cell_r(0, cell_id));

        U_ptr += 4;
    }

    writeUint16(0);
    
    while (E_count--) {
        unsigned short cell_id = *E_ptr;

        writeUint16(cell_id);
        writeUint16(get_cell_eatenby(0, cell_id));

        E_ptr += 4;
    }

    writeUint16(0);

    while (D_count--) {
        unsigned short cell_id = *D_ptr;

        writeUint16(cell_id);

        D_ptr += 4;
    }

    writeUint16(0);

    return dist; // Return final pointer so js knows how to slice the buffer
}

void clean(void* ptr, size_t bytes) {
    memset(ptr, 0, bytes);
}
