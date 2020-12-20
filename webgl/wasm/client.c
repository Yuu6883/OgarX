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
    unsigned short id;
    unsigned char type;
    short x;
    short y;
    short size;
} AddPacket;

typedef struct {
    unsigned short id;
    short x;
    short y;
    short size;
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

void deserialize(CellData data[], unsigned short* packet) {
    AddPacket* add_data = (AddPacket*) packet;

    while (add_data->id) {
        data[add_data->id].type = add_data->type;
        data[add_data->id].oldX = data[add_data->id].currX = data[add_data->id].netX = add_data->x * 2;
        data[add_data->id].oldY = data[add_data->id].currY = data[add_data->id].netY = add_data->y * 2;
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

        data[update_data->id].netX = update_data->x * 2;
        data[update_data->id].netY = update_data->y * 2;
        data[update_data->id].netSize = update_data->size;
        update_data++;
    }

    packet = (unsigned short*) update_data;
    packet++;

    EatPacket* eat_data = (EatPacket*) packet;

    while (eat_data->id) {
        data[eat_data->id].oldX = data[eat_data->id].currX;
        data[eat_data->id].oldY = data[eat_data->id].currY;
        data[eat_data->id].oldSize = data[eat_data->id].currSize;
        
        data[eat_data->id].netX = data[eat_data->by].netX;
        data[eat_data->id].netY = data[eat_data->by].netY;
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
    }
}

extern void print(float f);

unsigned int draw(CellData data_begin[], 
    unsigned short offset_table[], 
    RenderCell render_cells[], float lerp) {

    CellData* begin = data_begin;
    while ((void*) begin < (void*) offset_table) {
        offset_table[begin->type]++;
        begin++;
    }

    offset_table[0] = 0;

    unsigned int count = 0;

    for (unsigned short* ptr = offset_table; (void*) ptr < (void*) render_cells; ptr++)
        *ptr = count = count + *ptr;

    begin = data_begin;
    while ((void*) begin < (void*) offset_table) {
        if (begin->type) {
            unsigned short offset = offset_table[begin->type - 1]++;
            begin->currX = render_cells[offset].x = lerp * (begin->netX - begin->oldX) + begin->oldX;
            begin->currY = render_cells[offset].y = lerp * (begin->netY - begin->oldY) + begin->oldY;
            begin->currX = render_cells[offset].size = lerp * (begin->netSize - begin->oldSize) + begin->oldSize;
        }
        begin++;
    }

    unsigned short* end = (unsigned short*) render_cells - 1;

    while (end-- > offset_table)
        end[1] = end[0];
        
    end[1] = 0;

    return count;
}