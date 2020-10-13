typedef struct {
    float x;
    float y;
    float size;
    float skin;
    float r;
    float g;
    float b;
} Cell;

/*
#define SWAP(idx1, idx2, attr) t = arr[idx1].attr; arr[idx1].attr = arr[idx2].attr; arr[idx2].attr = t
#define SWAP_ALL(idx1, idx2) SWAP(idx1, idx2, x); SWAP(idx1, idx2, y); SWAP(idx1, idx2, size); SWAP(idx1, idx2, skin); SWAP(idx1, idx2, r); SWAP(idx1, idx2, g); SWAP(idx1, idx2, b);

void sort(Cell arr[], int n) {
    
    float t = 0;
    // Build Max Heap
    for (int i = 1; i < n; i++) { 
        // if child is bigger than parent 
        if (arr[i].size > arr[(i - 1) / 2].size) { 
            int j = i; 
      
            // swap child and parent until 
            // parent is smaller 
            while (arr[j].size > arr[(j - 1) / 2].size) { 
                SWAP_ALL(j, (j - 1) / 2); 
                j = (j - 1) / 2; 
            } 
        } 
    }

    for (int i = n - 1; i > 0; i--) { 
        // swap value of first indexed  
        // with last indexed  
        SWAP_ALL(0, i); 
        // maintaining heap property 
        // after each swapping 
        int j = 0, index; 
        do { 
            index = (2 * j + 1); 
              
            // if left child is smaller than  
            // right child point index variable  
            // to right child 
            if (arr[index].size < arr[index + 1].size && 
                                index < (i - 1)) index++; 
          
            // if parent is smaller than child  
            // then swapping parent with child  
            // having higher value 
            if (arr[j].size < arr[index].size && index < i) {
                SWAP_ALL(j, index);
            }
            j = index; 
        } while (index < i);
    }
} */

void sort(Cell cells[], Cell dist[], int indices[], int n) {

    int t = 0;

    for (int i = 0; i < n; i++)
        indices[i] = i;

    // Build Max Heap
    for (int i = 1; i < n; i++) { 
        // if child is bigger than parent 
        if (cells[indices[i]].size > cells[indices[(i - 1) / 2]].size) {
            int j = i;
            // swap child and parent until 
            // parent is smaller 
            while (cells[indices[j]].size > cells[indices[(j - 1) / 2]].size) { 
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
            if (cells[indices[index]].size < cells[indices[index + 1]].size && 
                index < (i - 1)) index++; 
          
            // if parent is smaller than child  
            // then swapping parent with child  
            // having higher value 
            if (cells[indices[j]].size < cells[indices[index]].size && index < i) {
                t = indices[j];
                indices[j] = indices[index];
                indices[index] = t;
            }
            j = index; 
        } while (index < i); 
    }

    for (int i = 0; i < n; i++)
        dist[i] = cells[indices[i]];
}