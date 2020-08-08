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
#define IS_MOTHER_CELL(type) type == 252
#define IS_VIRUS(type) type == 253
#define IS_PELLET(type) type == 254
#define IS_EJECTED(type) type == 255

#define EXIST_BIT 0x1
#define UPDATE_BIT 0x2
#define INSIDE_BIT 0x4
#define DEAD_BIT 0x8
#define AUTOSPLIT_BIT 0x10
#define REMOVE_BIT 0x20
#define MERGE_BIT 0x40

void update(Cell* cell, Cell* end, float dt_multi) {
    while (cell != end) {
        if (cell->flags & EXIST_BIT) {
            cell->age++;
            cell->flags = EXIST_BIT;
            if (cell->boost > 1) {
                float d = cell->boost / 9.0f * dt_multi;
                cell->x += cell->boostX * d;
                cell->y += cell->boostY * d;
                cell->flags |= UPDATE_BIT;
                cell->boost -= d;
            }
        }
        cell++;
    }
}

void decay_and_auto(Cell* cell, Cell* end, float dt_multi, float auto_size, float multi, float min) {
    while (cell != end) {
        if (cell->flags & EXIST_BIT && 
            IS_PLAYER(cell->type) && cell->r > min) {

            cell->r -= cell->r * multi * dt_multi;
            cell->flags |= UPDATE_BIT;
            if (cell->r > auto_size) cell->flags |= AUTOSPLIT_BIT;
        }
        cell++;
    }
}

void bound(Cell* cell, Cell* end, float l, float r, float b, float t) {
    while (cell != end) {
        if (cell->flags & EXIST_BIT) {
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
        }
        cell++;
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

#define PHYSICS_NON 0
#define PHYSICS_EAT 1
#define PHYSICS_COL 2

void resolve(Cell* cells, Cell* end, QuadNode* root, 
    void** node_stack_pointer, unsigned int noMergeDelay, unsigned int noColliDelay) {

    Cell* cell = cells;

    while (cell != end) {

        unsigned char flags = cell->flags;
        // Cell not exist, to be removed, or inside
        if (!(flags | EXIST_BIT) || (flags | (INSIDE_BIT | REMOVE_BIT))) {
            cell++;
            continue;
        }

        unsigned int stack_counter = 1;
        node_stack_pointer[0] = root;
        QuadNode* curr = root;

        while (stack_counter > 0) {
            // Has leaves, push leaves, if they intersect, to stack
            if (curr->tl) {
                if (cell->y - cell->r < curr->y) {
                    if (cell->x + cell->r > curr->x)
                        node_stack_pointer[stack_counter++] = curr->br;
                    if (cell->x - cell->r < curr->x)
                        node_stack_pointer[stack_counter++] = curr->bl;
                }
                if (cell->y + cell->r > curr->y) {
                    if (cell->x + cell->r > curr->x)
                        node_stack_pointer[stack_counter++] = curr->tr;
                    if (cell->x - cell->r < curr->x)
                        node_stack_pointer[stack_counter++] = curr->tl;
                }
            }

            for (unsigned int i = 0; i < curr->count; i++) {
                Cell* other = &cells[*(&curr->indices + i)];
                if (cell == other) continue; // Same cell
                if (cell->r < other->r) continue; // Skip double check

                unsigned char other_flags = other->flags;
                // Other cell doesn't exist?! or removed or inside, OR updated cuz they should belong to a new quadnode
                if (!(other_flags & EXIST_BIT) || 
                    (other_flags & (INSIDE_BIT | REMOVE_BIT | UPDATE_BIT))) continue;
                unsigned char action = PHYSICS_NON;
                // Check player x player
                if (IS_PLAYER(cell->type)) {
                    if (IS_PLAYER(other->type) && cell->type == other->type) {
                        // Collide
                        if (cell->age > noColliDelay && other->age > noColliDelay) {
                            action = PHYSICS_COL;
                        } else if ((cell->flags & MERGE_BIT) && (other->flags & MERGE_BIT)) {
                            action = PHYSICS_EAT;
                        }
                    } else action = PHYSICS_EAT;
                } else if (IS_VIRUS(cell->type) && IS_EJECTED(other->type)) {
                    // Virus can only eat ejected cell
                    action = PHYSICS_EAT;
                } else if (IS_EJECTED(cell->type) && IS_EJECTED(other->type)) {
                    // Ejected only collide with ejected cell
                    action = PHYSICS_COL;
                } else if (IS_MOTHER_CELL(cell->type)) {
                    // Mother cell eats everything
                    action = PHYSICS_EAT;
                }

                if (action == PHYSICS_NON) continue;
                if (action == PHYSICS_COL) {
                    // TODO: Collision handling here
                } else if (action == PHYSICS_EAT) {
                    // TODO: Eat handling here
                }
            }

            // Pop from the stack
            curr = (QuadNode*) node_stack_pointer[--stack_counter];
        }

        cell++;
    }
}