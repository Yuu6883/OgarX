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
    float x;
    float y;
    float size;
} RenderCell;

typedef struct {
    float x;
    float y;
    float size;
    float mass;
} RenderMass;

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
unsigned int bytes_per_render_mass() { return sizeof(RenderMass); }

// extern void log_add_packet(
//     unsigned short id,
//     unsigned short type,
//     short x,
//     short y,
//     unsigned short size);

void deserialize(CellData data[], unsigned short* packet) {
    AddPacket* add_data = (AddPacket*) packet;

    while (add_data->id) {
        data[add_data->id].type = add_data->type;
        data[add_data->id].oldX = data[add_data->id].currX = data[add_data->id].netX = add_data->x;
        data[add_data->id].oldY = data[add_data->id].currY = data[add_data->id].netY = add_data->y;
        data[add_data->id].oldSize = data[add_data->id].currSize = data[add_data->id].netSize = add_data->size;
        add_data++;
    }

    packet = (unsigned short*) add_data;
    packet++;

    UpdatePacket* update_data = (UpdatePacket*) packet;

    while (update_data->id) {
        data[update_data->id].oldX = data[update_data->id].currX;
        data[update_data->id].oldY = data[update_data->id].currY;
        data[update_data->id].oldSize = data[update_data->id].currSize;

        data[update_data->id].netX = update_data->x;
        data[update_data->id].netY = update_data->y;
        data[update_data->id].netSize = update_data->size;
        update_data++;
    }

    packet = (unsigned short*) update_data;
    packet++;

    EatPacket* eat_data = (EatPacket*) packet;

    while (eat_data->id) {
        
        data[eat_data->id].netX = data[eat_data->by].netX;
        data[eat_data->id].netY = data[eat_data->by].netY;

        data[eat_data->id].oldX = 0.0f;
        data[eat_data->id].oldY = 0.0f;
        data[eat_data->id].netSize = 0.0f;

        eat_data++;
    }

    packet = (unsigned short*) eat_data;
    packet++;

    DeletePacket* delete_data = (DeletePacket*) packet;

    while (delete_data->id) {
        data[delete_data->id].type = 0;

        data[delete_data->id].oldX = 0;
        data[delete_data->id].oldY = 0;
        data[delete_data->id].oldSize = 0;

        data[delete_data->id].currX = 0;
        data[delete_data->id].currY = 0;
        data[delete_data->id].currSize = 0;

        data[delete_data->id].netX = 0;
        data[delete_data->id].netY = 0;
        data[delete_data->id].netSize = 0;

        delete_data++;
    }
}

unsigned int draw_cells(CellData data_begin[], 
    unsigned short offset_table[], 
    RenderCell render_cells[], float lerp,
    float t, float b, float l, float r) {

    CellData* begin = data_begin;
    while ((void*) begin < (void*) offset_table) {
        if (begin->type) {
            if (!begin->netSize) {
                begin->currX = lerp * (begin->netX - begin->currX) + begin->currX;
                begin->currY = lerp * (begin->netY - begin->currY) + begin->currY;

                begin->oldX += lerp / 2.0f;
                if (begin->oldX >= 2.0f) {
                    begin->type = 0;
                    begin++;
                    continue;
                }
            } else {
                begin->currX = lerp * (begin->netX - begin->oldX) + begin->oldX;
                begin->currY = lerp * (begin->netY - begin->oldY) + begin->oldY;
                begin->currSize = lerp * (begin->netSize - begin->oldSize) + begin->oldSize;
            }

            if (begin->currX - begin->currSize < r &&
                begin->currX + begin->currSize > l &&
                begin->currY - begin->currSize < t &&
                begin->currY + begin->currSize > b) {
                offset_table[begin->type]++;
            }
        }
        begin++;
    }
    
    offset_table[0] = 0;

    unsigned int count = 0;

    for (unsigned short* ptr = offset_table; (void*) ptr < (void*) render_cells; ptr++)
        *ptr = count = count + *ptr;

    begin = data_begin;
    while ((void*) begin < (void*) offset_table) {
        if (begin->type &&
            begin->currX - begin->currSize < r &&
            begin->currX + begin->currSize > l &&
            begin->currY - begin->currSize < t &&
            begin->currY + begin->currSize > b) {
            unsigned short offset = offset_table[begin->type - 1]++;
            render_cells[offset].x = begin->currX;
            render_cells[offset].y = begin->currY;
            render_cells[offset].size = begin->currSize;
        }
        begin++;
    }

    unsigned short* end = (unsigned short*) render_cells - 1;

    while (end-- > offset_table)
        end[1] = end[0];
        
    end[1] = 0;

    return count;
}

unsigned int draw_text(CellData data_begin[], 
    CellData data_end[],
    unsigned short offset_table[], 
    RenderCell render_name[], RenderMass render_mass[], 
    float minScale,
    float t, float b, float l, float r) {

    float w = r - l;
    float h = t - b;
    float sizeCutoff = (w < h ? w : h) * minScale;

    unsigned int mass_offset = 0;

    CellData* begin = data_begin;
    while (begin < data_end) {
        if (begin->type && begin->type <= 250 && 
            begin->currSize > sizeCutoff &&
            begin->currX - begin->currSize < r &&
            begin->currX + begin->currSize > l &&
            begin->currY - begin->currSize < t &&
            begin->currY + begin->currSize > b) {
            offset_table[begin->type]++;

            unsigned short o = mass_offset++;
            render_mass[o].x = begin->currX;
            render_mass[o].y = begin->currY;
            render_mass[o].size = begin->currSize + 0.2f;
            render_mass[o].mass = begin->currSize * begin->currSize / 100.f;
        }
        begin++;
    }
    
    offset_table[0] = 0;

    unsigned int count = 0;

    for (unsigned short* ptr = offset_table; (void*) ptr < (void*) render_name; ptr++)
        *ptr = count = count + *ptr;

    begin = data_begin;
    while (begin < data_end) {
        if (begin->type && begin->type <= 250 && 
            begin->currSize > sizeCutoff &&
            begin->currX - begin->currSize < r &&
            begin->currX + begin->currSize > l &&
            begin->currY - begin->currSize < t &&
            begin->currY + begin->currSize > b) {
            unsigned short offset = offset_table[begin->type - 1]++;
            render_name[offset].x = begin->currX;
            render_name[offset].y = begin->currY;
            render_name[offset].size = begin->currSize + 0.1f;
        }
        begin++;
    }

    unsigned short* end = (unsigned short*) render_name - 1;

    while (end-- > offset_table)
        end[1] = end[0];
        
    end[1] = 0;

    return count;
}