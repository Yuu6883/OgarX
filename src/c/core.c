#include "memory.h"
#include <math.h>

typedef struct {
    float x;
    float y;
    float r;
    unsigned char type;
    unsigned char flags;
    unsigned short eatenBy;
    unsigned int age;
    float boostX;
    float boostY;
    float boost;
} Cell;

typedef struct {
    float x;
    float y;
    void* tl;
    void* tr;
    void* bl;
    void* br;
    unsigned short count;
    unsigned short indices; // placeholder
} QuadNode;

#define IS_PLAYER(type) type <= 250
#define IS_DEAD(type) type == 251
#define IS_ALIVE(type) type != 251
#define IS_MOTHER_CELL(type) type == 252
#define IS_VIRUS(type) type == 253
#define IS_PELLET(type) type == 254
#define NOT_PELLET(type) type != 254
#define IS_EJECTED(type) type == 255

#define EXIST_BIT 0x1
#define UPDATE_BIT 0x2
#define INSIDE_BIT 0x4
// Removed dead bit to type 251
#define AUTOSPLIT_BIT 0x10
#define REMOVE_BIT 0x20
#define MERGE_BIT 0x40
#define POP_BIT 0x80

#define CLEAR_BITS 0x59

extern float get_score(unsigned char id);

short get_cell_x(Cell ptr[], unsigned short id) { return ptr[id].x; };
short get_cell_y(Cell ptr[], unsigned short id) { return ptr[id].y; };
unsigned short get_cell_r(Cell ptr[], unsigned short id) { return ptr[id].r; };
unsigned char  get_cell_type(Cell ptr[], unsigned short id) { return ptr[id].type; };
unsigned short get_cell_eatenby(Cell ptr[], unsigned short id) { return ptr[id].eatenBy; };

void clear_cell(Cell cells[], unsigned short id) {
    memset(&cells[id], 0, sizeof(Cell));
}

void update(Cell cells[], unsigned short* ptr, float dt_multi,
    unsigned int eject_max_age,
    float auto_size, float decay_min, float static_decay, float dynamic_decay,
    float l, float r, float b, float t) {

    static_decay *= 0.01f;
    Cell* cell = &cells[*ptr];

    // Clear cell data 
    while (cell->flags & REMOVE_BIT) {
        memset(cell, 0, sizeof(Cell));
        cell = &cells[*++ptr]; // increment to next index
    }

    if (!*ptr) return;

    unsigned char curr_type = 0;
    float curr_multi = 1.0f;

    // Player cells
    while (*ptr) {
        // Increment age, clear bits
        cell->age++;
        cell->flags &= CLEAR_BITS;

        if (IS_EJECTED(cell->type) && cell->age > eject_max_age)
            cell->flags |= REMOVE_BIT;

        // Boost cell
        if (cell->boost > 1) {
            float db = cell->boost / 9.0f * dt_multi;
            cell->x += cell->boostX * db;
            cell->y += cell->boostY * db;
            cell->flags |= UPDATE_BIT;
            cell->boost -= db;
        }

        if (IS_PLAYER(cell->type)) {

            if (curr_type != cell->type) {
                curr_type = cell->type;
                float score = get_score(curr_type);
                curr_multi = (score - 0.01f * decay_min * decay_min) * 0.00005f * dynamic_decay;
                if (curr_multi < 1.f) curr_multi = 1.f;
            }

            // Decay and set the autosplit bit for player cells
            if (cell->r > decay_min) {
                cell->r -= curr_multi * cell->r * static_decay * dt_multi / 50.0f;
                cell->flags |= UPDATE_BIT;
            }
            if (auto_size && cell->r > auto_size && !(cell->flags & AUTOSPLIT_BIT)) {
                cell->flags |= AUTOSPLIT_BIT;
                cell->age = 0;
            }
        }


        // Bounce and clamp the cells in the box
        unsigned char bounce = cell->boost > 1;
        float hr = cell->r / 2;
        if (cell->x < l + hr) {
            cell->x = l + hr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostX = -cell->boostX;
        } 
        if (cell->x > r - hr) {
            cell->x = r - hr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostX = -cell->boostX;
        }
        if (cell->y > t - hr) {
            cell->y = t - hr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostY = -cell->boostY;
        }
        if (cell->y < b + hr) {
            cell->y = b + hr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostY = -cell->boostY;
        }
        
        cell = &cells[*++ptr]; // increment to next index
    }
}

int is_safe(Cell* cells, float x, float y, float r, QuadNode* root, void** node_stack_pointer) {
    unsigned int stack_counter = 1;
    node_stack_pointer[0] = root;
    QuadNode* curr = root;

    int counter = 0;
    float dx;
    float dy;

    while (stack_counter > 0) {
        // Has leaves, push leaves, if they intersect, to stack
        if (curr->tl) {
            if (y - r < curr->y) {
                if (x + r > curr->x)
                    node_stack_pointer[stack_counter++] = curr->br;
                if (x - r < curr->x)
                    node_stack_pointer[stack_counter++] = curr->bl;
            }
            if (y + r > curr->y) {
                if (x + r > curr->x)
                    node_stack_pointer[stack_counter++] = curr->tr;
                if (x - r < curr->x)
                    node_stack_pointer[stack_counter++] = curr->tl;
            }
        }
        // TODO: optimize if the quadnode is inside box, we don't need to check item at all

        for (unsigned int i = 0; i < curr->count; i++) {
            Cell* cell = &cells[*(&curr->indices + i)];
            if (cell->type > 253) continue;
            dx = cell->x - x;
            dy = cell->y - y;
            counter++;
            if (dx * dx + dy * dy < (r + cell->r) * (r + cell->r)) return -counter;
        }

        // Pop from the stack
        curr = (QuadNode*) node_stack_pointer[--stack_counter];
    }
    return counter;
}

void sort_indices(Cell cells[], unsigned short indices[], int n) {
    if (!n) return;
    
    int t = 0;

    // Build Max Heap
    for (int i = 1; i < n; i++) { 
        // if child is bigger than parent 
        if (cells[indices[i]].r < cells[indices[(i - 1) / 2]].r) {
            int j = i;
            // swap child and parent until 
            // parent is smaller 
            while (cells[indices[j]].r < cells[indices[(j - 1) / 2]].r) { 
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
            if (cells[indices[index]].r > cells[indices[index + 1]].r && 
                index < (i - 1)) index++; 
          
            // if parent is smaller than child  
            // then swapping parent with child  
            // having higher value 
            if (cells[indices[j]].r > cells[indices[index]].r && index < i) {
                t = indices[j];
                indices[j] = indices[index];
                indices[index] = t;
            }
            j = index; 
        } while (index < i); 
    }
}

void update_player_cells(Cell cells[], unsigned short* indices, unsigned int n,
    float mouse_x, float mouse_y, float dt,
    float merge_initial, float merge_increase, float player_speed,
    unsigned int merge_time, unsigned int no_merge_delay, unsigned char merge_version_new) {
    
    if (!n) return;

    if (merge_time > 0.0f) {
        if (merge_version_new) {
            for (unsigned int i = 0; i < n; i++) {
                Cell* cell = &cells[indices[i]];
                float increase = roundf(25.f * cell->r * merge_increase);
                float time = increase > no_merge_delay ? increase : no_merge_delay;
                if (cell->age > merge_initial && cell->age > time) cell->flags |= MERGE_BIT;
            }
        } else {
            for (unsigned int i = 0; i < n; i++) {
                Cell* cell = &cells[indices[i]];
                float increase = roundf(25.f * cell->r * merge_increase);
                float time = merge_initial + merge_increase;
                if (cell->age > no_merge_delay && cell->age > time) cell->flags |= MERGE_BIT;
            }
        }
    } else {
        for (unsigned int i = 0; i < n; i++) {
            Cell* cell = &cells[indices[i]];
            if (cell->age > no_merge_delay) cell->flags |= MERGE_BIT;
        }
    }

    // Move player cells
    for (unsigned int i = 0; i < n; i++) {
        Cell* cell = &cells[indices[i]];

        float dx = mouse_x - cell->x;
        float dy = mouse_y - cell->y;
        float d = sqrtf(dx * dx + dy * dy);
        if (d < 1) continue; dx /= d; dy /= d;
        float speed = 88.f * powf(cell->r, -0.4396754) * player_speed;
        float m = (speed < d ? speed : d) * dt;
        cell->x += dx * m;
        cell->y += dy * m;
    }
}

#define PHYSICS_NON 0
#define PHYSICS_EAT 1
#define PHYSICS_COL 2

#define SKIP_RESOLVE_BITS 0xa4

unsigned int resolve(Cell cells[],
    unsigned short* ptr, unsigned short pellet_count,
    QuadNode* root, QuadNode** sp, 
    unsigned int noMergeDelay, unsigned int noColliDelay, 
    float eatOverlap, float eatMulti, float virusMaxSize, unsigned int removeTick) {

    unsigned int collisions = 0;

    while (*ptr) {

        Cell* cell = &cells[*ptr++];

        unsigned char flags = cell->flags;
        unsigned char type = cell->type;

        // Cell is to be removed, popped, or inside another cell
        if (flags & SKIP_RESOLVE_BITS) continue;

        if (IS_PELLET(type)) {
            ptr += pellet_count;
            continue;
        }

        if (IS_DEAD(type)) {
            if (cell->age > removeTick) {
                cell->flags |= REMOVE_BIT;
                cell->eatenBy = 0;
            }
        }

        QuadNode** node_stack_pointer = sp;
        *node_stack_pointer++ = root;

        QuadNode* curr;

        unsigned char colli = cell->age > noColliDelay;
        float x = cell->x;
        float y = cell->y;
        float r1 = cell->r;
        float a = r1 * r1;

        float cell_l = cell->x - r1;
        float cell_r = cell->x + r1;
        float cell_t = cell->y + r1;
        float cell_b = cell->y - r1;

        while (node_stack_pointer > sp) {
            // Pop from the stack
            curr = (QuadNode*) *--node_stack_pointer;

            // Has leaves, push leaves, if they intersect, to stack
            if (curr->tl) {
                if (cell_b < curr->y) {
                    if (cell_r > curr->x)
                        *node_stack_pointer++ = curr->br;
                    if (cell_l < curr->x)
                        *node_stack_pointer++ = curr->bl;
                }
                if (cell_t > curr->y) {
                    if (cell_r > curr->x)
                        *node_stack_pointer++ = curr->tr;
                    if (cell_l < curr->x)
                        *node_stack_pointer++ = curr->tl;
                }
            }

            unsigned short* iter = &curr->indices;
            unsigned short* end = iter + curr->count;

            while(iter < end) {
                unsigned short other_index = *iter++;
                Cell* other = &cells[other_index];
                
                if (cell == other) continue; // Same cell
                if (r1 < other->r) continue; // Skip double check
                else if (r1 == other->r && cell > other) continue;

                unsigned char other_flags = other->flags;

                // Other cell can be skipped
                if (other_flags & SKIP_RESOLVE_BITS) continue;
                
                unsigned char action = PHYSICS_NON;

                // Check player x player
                if (IS_PLAYER(type)) {
                    if (type == other->type) { // same player
                        if (flags & other_flags & MERGE_BIT) // Both merge bits are set
                            action = PHYSICS_EAT; // player merge
                        else if (colli && other->age > noColliDelay) action = PHYSICS_COL; // player collide
                    } else action = PHYSICS_EAT; // player eats everything else
                } else if (IS_VIRUS(type) && IS_EJECTED(other->type)) {
                    // Virus can only eat ejected cell
                    action = PHYSICS_EAT;
                } else if (IS_EJECTED(type) && IS_EJECTED(other->type)) {
                    // Ejected only collide with ejected cell
                    action = PHYSICS_COL;
                } else if (IS_DEAD(type)) {
                    // Dead cell can only collide with others
                    if (IS_DEAD(other->type)) action = PHYSICS_COL;
                } else if (IS_MOTHER_CELL(type)) {
                    // Mother cell eats everything?
                    action = PHYSICS_EAT;
                }

                if (action == PHYSICS_NON) continue;

                float dx = other->x - x;
                float dy = other->y - y;
                float r2 = other->r;

                float r_sum = r1 + r2;
                float d_sqr = dx * dx + dy * dy;
                
                // Does not overlap
                if (d_sqr >= r_sum * r_sum) continue;
                
                float d = sqrtf(d_sqr);

                collisions++;

                if (action == PHYSICS_COL) {
                    float m = r_sum - d;

                    if (d <= 0.f) {
                        d = 1.f;
                        dx = 1.f;
                        dy = 0.f;
                    } else {
                        dx /= d; 
                        dy /= d;
                    }
                    
                    // Other cell is inside this cell, mark it
                    if (d + r2 < r1) other->flags |= INSIDE_BIT;

                    float b = r2 * r2;
                    float sum = a + b;

                    float aM = b / sum;
                    float bM = a / sum;

                    float m1 = (m < r1 ? m : r1) * aM;
                    x -= dx * m1; // * 0.8f;
                    y -= dy * m1; // * 0.8f;

                    float m2 = (m < r2 ? m : r2) * bM;
                    other->x += dx * m2; // * 0.8f;
                    other->y += dy * m2; // * 0.8f;

                    // Mark the cell as updated
                    cell->flags |= UPDATE_BIT;
                    other->flags |= UPDATE_BIT;

                } else if (action == PHYSICS_EAT) {
                    if ((type == other->type || 
                        r1 > other->r * eatMulti) && 
                        d < r1 - other->r / eatOverlap) {

                        a = r1 * r1 + r2 * r2;
                        r1 = sqrtf(a);

                        if (IS_VIRUS(other->type) || IS_MOTHER_CELL(other->type)) {
                            other->eatenBy = 0;
                        } else {
                            other->eatenBy = ((unsigned int) cell) >> 5;
                        }
                        other->flags |= REMOVE_BIT;
                        if (IS_PLAYER(type) && IS_EJECTED(other->type)) {
                            float ratio = other->r / (r1 + 100.f);
                            cell->boost += ratio * 0.02f * other->boost;
                            float bx = cell->boostX + ratio * 0.02f * other->boostX;
                            float by = cell->boostY + ratio * 0.02f * other->boostY;
                            float norm = sqrt(bx * bx + by * by);
                            cell->boostX = bx / norm;
                            cell->boostY = by / norm;
                        }
                        if (IS_VIRUS(other->type) || IS_MOTHER_CELL(other->type))
                            cell->flags |= 0x80; // Mark this cell as popped
                        if (IS_VIRUS(type) && IS_EJECTED(other->type) && r1 >= virusMaxSize) {
                            cell->flags |= 0x80; // Mark this as virus to be split
                            cell->boostX = other->boostX;
                            cell->boostY = other->boostY;
                        }
                    }
                }
            }
        }
        
        cell->r = r1;
        cell->x = x;
        cell->y = y;
    }
    
    return collisions;
}

unsigned int select(Cell cells[], QuadNode* root, 
    void** node_stack_pointer, unsigned short* list_pointer, 
    float l, float r, float b, float t) {
    
    unsigned int list_counter = 0;
    unsigned int stack_counter = 0;

    // Push root to stack
    node_stack_pointer[stack_counter++] = root;

    while (stack_counter > 0) {
        // Pop from the stack
        QuadNode* curr = (QuadNode*) node_stack_pointer[--stack_counter];

        // Has leaves, push leaves, if they intersect, to stack
        if (curr->tl) {
            if (b < curr->y) {
                if (r > curr->x)
                    node_stack_pointer[stack_counter++] = curr->br;
                if (l < curr->x)
                    node_stack_pointer[stack_counter++] = curr->bl;
            }
            if (t > curr->y) {
                if (r > curr->x)
                    node_stack_pointer[stack_counter++] = curr->tr;
                if (l < curr->x)
                    node_stack_pointer[stack_counter++] = curr->tl;
            }
        }

        for (unsigned int i = 0; i < curr->count; i++) {
            unsigned short id = *(&curr->indices + i);
            Cell* cell = &cells[id];
            if (cell->x - cell->r <= r &&
                cell->x + cell->r >= l &&
                cell->y - cell->r <= t &&
                cell->y + cell->r >= b &&
                (NOT_PELLET(cell->type) || cell->age > 1)) {
                list_pointer[list_counter++] = id;
            }
        }
    }

    return list_counter;
}