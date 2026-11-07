#include "preview_gfx.h"
#include "animation.cpp"
int main(){ unsigned long times[]={100,1000,3000,6000}; int i=0; for(unsigned long clock=0;i<4;clock+=33){previewNow=clock;restState(clock);while(i<4 && clock>=times[i]){display.save(std::to_string(i)+".ppm");i++;}}}
