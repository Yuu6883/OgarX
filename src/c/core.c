#include "memory.h"
#include <math.h>

typedef struct {
    float x;
    float y;
    float r;
    unsigned char type;
    unsigned char flags;
    unsigned short eatenBy;
    float age;
    float boostX;
    float boostY;
    float boost;
} Cell;

typedef struct {
    float x;
    float y;
    float hw;
    float hh;
    void* tl;
    void* tr;
    void* bl;
    void* br;
    unsigned short count;
    unsigned short indices; // placeholder
} QuadNode;

#define IS_PLAYER(type) type <= 250
#define NOT_PLAYER(type) type > 250
#define IS_DEAD(type) type == 251
#define IS_ALIVE(type) type != 251
// #define IS_MOTHER_CELL(type) type == 252
#define IS_VIRUS(type) type == 253
#define IS_PELLET(type) type == 254
#define NOT_PELLET(type) type != 254
#define IS_EJECTED(type) type == 255

#define EXIST_BIT 0x1
#define UPDATE_BIT 0x2
#define INSIDE_BIT 0x4
#define LOCK_BIT 0x8
#define AUTOSPLIT_BIT 0x10
#define REMOVE_BIT 0x20
#define MERGE_BIT 0x40
#define POP_BIT 0x80

#define CLEAR_BITS 0x11

extern float get_score(unsigned char id);
extern void unlock_line(unsigned char id);

extern void remove_cell(unsigned short id, unsigned char type, 
    unsigned short eatenBy, unsigned char eatenByType);
extern void split_virus(float x, float y, float boostX, float boostY);
extern void pop_player(unsigned short id, unsigned char type, float mass);
extern void tree_update(unsigned short id);

size_t bytes_per_cell() { return sizeof(Cell); }

#define UPDATE_BITS 0x12
unsigned char get_cell_updated(Cell ptr[], unsigned short id) { 
    return IS_PLAYER(ptr[id].type) || (ptr[id].flags & UPDATE_BITS); 
};

float get_cell_x(Cell ptr[], unsigned short id) { return ptr[id].x; };
float get_cell_y(Cell ptr[], unsigned short id) { return ptr[id].y; };
unsigned short get_cell_r(Cell ptr[], unsigned short id) { return ptr[id].r; };
unsigned char  get_cell_type(Cell ptr[], unsigned short id) { return ptr[id].type; };
unsigned short get_cell_eatenby(Cell ptr[], unsigned short id) { return ptr[id].eatenBy; };

unsigned short new_cell(Cell cells[], unsigned short next_id, float x, float y, float size, float type, 
    float boost_x, float boost_y, float boost) {
    
    while (!next_id || (cells[next_id].flags & EXIST_BIT)) next_id++;

    Cell* cell = &cells[next_id];

    cell->x = x;
    cell->y = y;
    cell->r = size;
    cell->type = type;
    cell->boostX = boost_x;
    cell->boostY = boost_y;
    cell->boost = boost;
    cell->flags = EXIST_BIT;

    return next_id;
}

unsigned short kill_cell(Cell cells[], unsigned short id, unsigned short next_id) {
    
    while (!next_id || (cells[next_id].flags & EXIST_BIT)) next_id++;

    Cell* old_cell = &cells[id];
    Cell* new_cell = &cells[next_id];

    memcpy(new_cell, old_cell, sizeof(Cell));
    memset(old_cell, 0, sizeof(Cell));

    new_cell->type = 251;
    new_cell->flags = EXIST_BIT;
    new_cell->age = 0.0f;
    
    return next_id;
}

void update(Cell cells[], unsigned short* ptr, float dt,
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
        cell->age += dt;
        cell->flags &= CLEAR_BITS;

        if (IS_EJECTED(cell->type) && eject_max_age && cell->age > eject_max_age)
            cell->flags |= REMOVE_BIT;

        // Boost cell
        if (cell->boost > 1.0f) {
            float db = cell->boost * 0.0025f * dt;
            cell->x += cell->boostX * db;
            cell->y += cell->boostY * db;
            if (NOT_PLAYER(cell->type))
                cell->flags |= UPDATE_BIT;
            cell->boost -= db;
        } else {
            cell->boost = 1.0f;
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
                cell->r -= curr_multi * cell->r * static_decay * dt * 0.0001f;
            }

            if (auto_size && cell->r > auto_size && !(cell->flags & AUTOSPLIT_BIT)) {
                cell->flags |= AUTOSPLIT_BIT;
                cell->age = 0.0f;
            }
        }

        // Bounce and clamp the cells in the box
        unsigned char bounce = cell->boost > 1;
        float cr = cell->r;
        if (cell->x < l + cr) {
            cell->x = l + cr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostX = -cell->boostX;
        } else if (cell->x > r - cr) {
            cell->x = r - cr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostX = -cell->boostX;
        }
        if (cell->y > t - cr) {
            cell->y = t - cr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostY = -cell->boostY;
        } else if (cell->y < b + cr) {
            cell->y = b + cr;
            cell->flags |= UPDATE_BIT;
            if (bounce) cell->boostY = -cell->boostY;
        }
        
        cell = &cells[*++ptr]; // increment to next index
    }
}

void update_player_cells(Cell cells[], unsigned short* indices, unsigned int n,
    float mouse_x, float mouse_y, 
    unsigned char lock_dir, float a, float b, float c, 
    float dt,
    float merge_initial, float merge_increase, float player_speed, float normalizer,
    unsigned int merge_time, unsigned int no_merge_delay, unsigned char merge_version_new) {
    
    if (!n) return;

    if (merge_time > 0.0f) {
        if (merge_version_new) {
            for (unsigned int i = 0; i < n; i++) {
                Cell* cell = &cells[indices[i]];
                float increase = 25.f * cell->r * merge_increase;
                float time = increase > no_merge_delay ? increase : no_merge_delay;
                if (cell->age > merge_initial && cell->age > normalizer * time) cell->flags |= MERGE_BIT;
            }
        } else {
            for (unsigned int i = 0; i < n; i++) {
                Cell* cell = &cells[indices[i]];
                float increase = 25.f * cell->r * merge_increase;
                float time = merge_initial + merge_increase;
                if (cell->age > no_merge_delay && cell->age > normalizer * time) cell->flags |= MERGE_BIT;
            }
        }
    } else {
        for (unsigned int i = 0; i < n; i++) {
            Cell* cell = &cells[indices[i]];
            if (cell->age > no_merge_delay) cell->flags |= MERGE_BIT;
        }
    }

    // Move player cells
    if (lock_dir) {
        unsigned char all_flags = 0;
        // ax + by = c
        if (a) {
            for (unsigned int i = 0; i < n; i++) {
                Cell* cell = &cells[indices[i]];
                all_flags |= cell->flags;
                cell->flags |= LOCK_BIT;

                float dx = mouse_x - cell->x;
                float dy = mouse_y - cell->y;
                float d = sqrtf(dx * dx + dy * dy);
                if (d < 1) continue; dy /= d;

                float speed = 1.76f * powf(cell->r, -0.4396754) * player_speed;
                float m = (speed < d ? speed : d) * dt;
                cell->y += dy * m;
                // Project x
                cell->x = (-c - b * cell->y) / a;
            }
        } else if (b) {
            for (unsigned int i = 0; i < n; i++) {
                Cell* cell = &cells[indices[i]];
                all_flags |= cell->flags;
                cell->flags |= LOCK_BIT;

                float dx = mouse_x - cell->x;
                float dy = mouse_y - cell->y;
                float d = sqrtf(dx * dx + dy * dy);
                if (d < 1) continue; dx /= d;

                float speed = 1.76f * powf(cell->r, -0.4396754) * player_speed;
                float m = (speed < d ? speed : d) * dt;
                cell->x += dx * m;
                cell->y = (-c - a * cell->x) / b;
            }
        } else {
            // End of world.
        }
        // This bit is used for checking wall
        if (all_flags & UPDATE_BIT) {
            // IF ANY CELL TOUCHES THE WALL
            unlock_line(cells[indices[0]].type);
        }
    } else {
        for (unsigned int i = 0; i < n; i++) {
            Cell* cell = &cells[indices[i]];

            float dx = mouse_x - cell->x;
            float dy = mouse_y - cell->y;
            float d = sqrtf(dx * dx + dy * dy);
            if (d < 1) continue; dx /= d; dy /= d;
            float speed = 1.76f * powf(cell->r, -0.4396754) * player_speed;
            float m = (speed < d ? speed : d) * dt;
            cell->x += dx * m;
            cell->y += dy * m;
        }
    }
}

int is_safe(Cell* cells, float x, float y, float r, QuadNode* root, QuadNode** sp, unsigned char ignoreType) {
    
    QuadNode** node_stack_pointer = sp;
    *node_stack_pointer++ = root;

    QuadNode* curr;

    int counter = 0;
    float dx;
    float dy;

    while (node_stack_pointer > sp) {
        // Pop from the stack
        curr = (QuadNode*) *--node_stack_pointer;

        if (curr->tl) {
            if (y - r < curr->y) {
                if (x + r > curr->x)
                    *node_stack_pointer++ = curr->br;
                if (x - r < curr->x)
                    *node_stack_pointer++ = curr->bl;
            }
            if (y + r > curr->y) {
                if (x + r > curr->x)
                    *node_stack_pointer++ = curr->tr;
                if (x - r < curr->x)
                    *node_stack_pointer++ = curr->tl;
            }
        }
        
        for (unsigned int i = 0; i < curr->count; i++) {
            Cell* cell = &cells[*(&curr->indices + i)];
            if (cell->type > ignoreType) continue;
            dx = cell->x - x;
            dy = cell->y - y;
            counter++;
            if (dx * dx + dy * dy < (r + cell->r) * (r + cell->r)) return -counter;
        }
    }
    return counter;
}

void sort_indices(Cell cells[], unsigned short indices[], int n) {
    if (!n) return;
    
    int t = 0;

    // Build Max Heap
    for (int i = 1; i < n; i++) { 
        // if child is bigger than parent 
        if (cells[indices[i]].boost < cells[indices[(i - 1) / 2]].boost ||
            cells[indices[i]].r  < cells[indices[(i - 1) / 2]].r) {
            int j = i;
            // swap child and parent until 
            // parent is smaller 
            while (cells[indices[j]].boost < cells[indices[(j - 1) / 2]].boost || 
                   cells[indices[j]].r < cells[indices[(j - 1) / 2]].r) { 
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
            if ((cells[indices[index]].boost > cells[indices[index + 1]].boost || 
                 cells[indices[index]].r > cells[indices[index + 1]].r) && index < (i - 1)) index++; 
          
            // if parent is smaller than child  
            // then swapping parent with child  
            // having higher value 
            if ((cells[indices[j]].boost > cells[indices[index]].boost ||
                 cells[indices[j]].r > cells[indices[index]].r) && index < i) {
                    
                t = indices[j];
                indices[j] = indices[index];
                indices[index] = t;
            }
            j = index; 
        } while (index < i); 
    }
}

#define PHYSICS_NON 0
#define PHYSICS_EAT 1
#define PHYSICS_COL 2

#define SKIP_RESOLVE_BITS 0xa4

extern float get_line_a(unsigned char id);
extern float get_line_b(unsigned char id);
extern float get_line_c(unsigned char id);

extern void console_log(unsigned short id);

unsigned int resolve(Cell cells[],
    unsigned short* ptr, unsigned short pellet_count,
    QuadNode* root, QuadNode** sp,
    unsigned int no_merge_delay, unsigned int no_colli_delay, 
    float eat_overlap, float eat_multi, 
    float virus_boost, float virus_max_boost,
    float virus_size, float virus_max_size, unsigned int remove_tick) {

    unsigned int collisions = 0;
    unsigned short* ptr_copy = ptr;

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

        if (IS_EJECTED(type) && !(flags & UPDATE_BIT)) continue; 

        if (IS_DEAD(type)) {
            if (cell->age > remove_tick) {
                cell->flags |= REMOVE_BIT;
                cell->eatenBy = 0;
                continue;
            }
        }

        QuadNode** node_stack_pointer = sp;
        *node_stack_pointer++ = root;

        QuadNode* curr;

        unsigned char colli = cell->age > no_colli_delay;
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
                
                unsigned char other_flags = other->flags;

                // Other cell can be skipped
                if (other_flags & SKIP_RESOLVE_BITS) continue;

                unsigned char action = PHYSICS_NON;

                // Check player x player
                if (IS_PLAYER(type)) {
                    if (type == other->type) { // same player
                        if (flags & other_flags & MERGE_BIT) // Both merge bits are set
                            action = PHYSICS_EAT; // player merge
                        else if (colli && other->age > no_colli_delay) action = PHYSICS_COL; // player collide
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
                }
                // else if (IS_MOTHER_CELL(type)) {
                //     // Mother cell eats everything?
                //     action = PHYSICS_EAT;
                // }

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
                        continue;
                    } else {
                        dx /= d; 
                        dy /= d;
                    }
                    
                    // Other cell is inside this cell, mark it
                    other->flags |= (d + r2 < r1) << 2; 
                    // 1 << 2 = 0x4 which is INSIDE_BIT, but we are doing branchless here

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
                        r1 > other->r * eat_multi) && 
                        d < r1 - other->r / eat_overlap) {

                        a = r1 * r1 + r2 * r2;
                        r1 = sqrtf(a);

                        if (IS_VIRUS(other->type)) { // || IS_MOTHER_CELL(other->type)) {
                            other->eatenBy = 0;
                        } else {
                            other->eatenBy = cell - cells;
                        }

                        // Mark the cells as updated/removed
                        cell->flags |= UPDATE_BIT;
                        other->flags |= REMOVE_BIT;
                        if (NOT_PLAYER(type)) cell->flags |= AUTOSPLIT_BIT;

                        if (IS_PLAYER(type) && IS_EJECTED(other->type)) {
                            float ratio = other->r / (r1 + 100.f);
                            cell->boost += ratio * 0.025f * other->boost;
                            float bx = cell->boostX + ratio * 0.02f * other->boostX;
                            float by = cell->boostY + ratio * 0.02f * other->boostY;
                            float norm = sqrt(bx * bx + by * by);
                            cell->boostX = bx / norm;
                            cell->boostY = by / norm;
                        }
                        if (IS_VIRUS(other->type)) // || IS_MOTHER_CELL(other->type))
                            cell->flags |= POP_BIT; // Mark this cell as popped
                        if (IS_VIRUS(type) && IS_EJECTED(other->type)) {
                            if (virus_max_size && r1 >= virus_max_size) {
                                cell->flags |= POP_BIT; // Mark this as virus to be split
                                cell->boostX = other->boostX;
                                cell->boostY = other->boostY;
                            }
                            if (virus_boost) {
                                float newBoost = cell->boost + virus_boost;
                                newBoost = newBoost > virus_max_boost ? virus_max_boost : newBoost;
                                cell->boostX = cell->boostX * cell->boost + other->boostX * virus_boost;
                                cell->boostY = cell->boostY * cell->boost + other->boostY * virus_boost;
                                float norm = sqrtf(cell->boostX * cell->boostX + cell->boostY * cell->boostY);
                                cell->boostX /= norm;
                                cell->boostY /= norm;
                                cell->boost = newBoost;
                            }
                        }
                    }
                }
            }
        }

        cell->r = r1;
        cell->x = x;
        cell->y = y;
    }
    
    unsigned char lock_type = 0;
    float line_a;
    float line_b;
    float line_c;
    float line_a_b_sqr_sum_inv;
    
    // Post resolve
    while (1) {
        unsigned short id = *ptr_copy++;
        if (!id) break;

        Cell* cell = &cells[id];
        unsigned char type = cell->type;
        unsigned char flags = cell->flags;

        if (flags & REMOVE_BIT) {
            remove_cell(id, type, cell->eatenBy, cells[cell->eatenBy].type);
            continue;
        } else if (flags & POP_BIT) {
            if (IS_VIRUS(type)) {
                cell->r = virus_size;
                split_virus(cell->x, cell->y, cell->boostX, cell->boostY);
            } else {
                pop_player(id, type, cell->r * cell->r * 0.01f);
            }
            continue;
        } else tree_update(id);

        if (flags & LOCK_BIT) {
            if (lock_type != type) {
                line_a = get_line_a(type);
                line_b = get_line_b(type);
                line_c = get_line_c(type);
                line_a_b_sqr_sum_inv = 1.f / (line_a * line_a + line_b * line_b);
                lock_type = type;
            }
            float x0 = cell->x;
            float y0 = cell->y;
            cell->x = (line_b * (line_b * x0 - line_a * y0) - line_a * line_c) * line_a_b_sqr_sum_inv;
            cell->y = (line_a * (-line_b * x0 + line_a * y0) - line_b * line_c) * line_a_b_sqr_sum_inv;
        }
    }

    return collisions;
}

unsigned int select(Cell cells[], QuadNode* root, 
    QuadNode** sp, unsigned short* list_pointer, 
    float l, float r, float b, float t) {
    
    unsigned short* write_pointer = list_pointer;

    QuadNode** node_stack_pointer = sp;
    // Push root to stack
    *node_stack_pointer++ = root;
    // Current node
    QuadNode* curr;

    while (node_stack_pointer > sp) {
        // Pop from the stack
        curr = *--node_stack_pointer;

        if (l < curr->x - curr->hw &&
            r > curr->x + curr->hw &&
            b < curr->y - curr->hh &&
            t > curr->y + curr->hh) {

            // Temp stack pointer to save where we started inclusive check
            QuadNode** temp_stack_pointer = node_stack_pointer;
            *node_stack_pointer++ = curr;

            QuadNode* curr_inclusive;
            
            while (node_stack_pointer > temp_stack_pointer) {
                // Pop from the stack
                curr_inclusive = *--node_stack_pointer;
                // Has leaves, push leaves without checking if they intersect
                if (curr_inclusive->tl) {
                    *node_stack_pointer++ = curr_inclusive->br;
                    *node_stack_pointer++ = curr_inclusive->bl;
                    *node_stack_pointer++ = curr_inclusive->tr;
                    *node_stack_pointer++ = curr_inclusive->tl;
                }

                // Copy count * 2 bytes of indices data directly to write pointer
                memcpy(write_pointer, &curr_inclusive->indices, curr_inclusive->count << 1);
                write_pointer += curr_inclusive->count;
            }
        } else {
            // Has leaves, push leaves, if they intersect, to stack
            if (curr->tl) {
                if (b < curr->y) {
                    if (r > curr->x)
                        *node_stack_pointer++ = curr->br;
                    if (l < curr->x)
                        *node_stack_pointer++ = curr->bl;
                }
                if (t > curr->y) {
                    if (r > curr->x)
                        *node_stack_pointer++ = curr->tr;
                    if (l < curr->x)
                        *node_stack_pointer++ = curr->tl;
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
                    *write_pointer++ = id;
                }
            }
        }
    }

    return write_pointer - list_pointer;
}