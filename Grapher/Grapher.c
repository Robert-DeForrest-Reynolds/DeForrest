#include <raylib.h>

int screen_height = 850;
int screen_width = 850;

int main(){

    InitWindow(screen_width, screen_height, "Grapher");
    SetTargetFPS(60);

    while(!WindowShouldClose()){
        BeginDrawing();
        ClearBackground(GRAY);
        EndDrawing();
    }

}
