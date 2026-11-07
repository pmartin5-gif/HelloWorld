// Small reusable drawing mock for composition previews, not an ESP32 emulator.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <random>
#include <string>
using byte = uint8_t;
using std::min;
using std::max;
constexpr float PI = 3.14159265358979323846f;
constexpr float TWO_PI = 2.0f * PI;
static unsigned long previewNow = 0;
unsigned long millis() { return previewNow; }
long random(long low, long high) {
  static std::mt19937 generator(42);
  return high > low ? std::uniform_int_distribution<long>(low, high - 1)(generator) : low;
}
long random(long high) { return random(0, high); }
float smoothProgress(float v) {
  v = max(0.0f, min(1.0f, v));
  return v * v * (3.0f - 2.0f * v);
}
struct PreviewDisplay {
  uint16_t pixels[32][32] = {};
  uint16_t color565(int r, int g, int b) {
    return ((r & 248) << 8) | ((g & 252) << 3) | (b >> 3);
  }
  int width() { return 32; }
  int height() { return 32; }
  void drawPixel(int x, int y, uint16_t c) {
    if (x >= 0 && x < 32 && y >= 0 && y < 32) pixels[y][x] = c;
  }
  void drawPixelRGB888(int x, int y, int r, int g, int b) { drawPixel(x, y, color565(r,g,b)); }
  void fillScreen(uint16_t c) { for (auto &row : pixels) for (auto &p : row) p = c; }
  void clearDisplay() { fillScreen(0); }
  void drawFastHLine(int x, int y, int w, uint16_t c) {
    if (w < 0) { x += w + 1; w = -w; }
    for (int i = 0; i < w; i++) drawPixel(x+i,y,c);
  }
  void drawFastVLine(int x, int y, int h, uint16_t c) {
    if (h < 0) { y += h + 1; h = -h; }
    for (int i = 0; i < h; i++) drawPixel(x,y+i,c);
  }
  void fillRect(int x, int y, int w, int h, uint16_t c) {
    for (int i = 0; i < h; i++) drawFastHLine(x,y+i,w,c);
  }
  void drawRect(int x, int y, int w, int h, uint16_t c) {
    drawFastHLine(x,y,w,c); drawFastHLine(x,y+h-1,w,c);
    drawFastVLine(x,y,h,c); drawFastVLine(x+w-1,y,h,c);
  }
  void drawLine(int x, int y, int xx, int yy, uint16_t c) {
    int dx=abs(xx-x), sx=x<xx?1:-1, dy=-abs(yy-y), sy=y<yy?1:-1, e=dx+dy;
    for (;;) {
      drawPixel(x,y,c);
      if (x==xx && y==yy) break;
      int ee=2*e;
      if (ee>=dy) { e+=dy; x+=sx; }
      if (ee<=dx) { e+=dx; y+=sy; }
    }
  }
  void fillCircle(int x, int y, int r, uint16_t c) {
    for(int dy=-r;dy<=r;dy++) for(int dx=-r;dx<=r;dx++)
      if(dx*dx+dy*dy<=r*r) drawPixel(x+dx,y+dy,c);
  }
  void drawCircle(int x, int y, int r, uint16_t c) {
    int dx=r, dy=0, e=1-r;
    while(dx>=dy) {
      drawPixel(x+dx,y+dy,c); drawPixel(x+dy,y+dx,c);
      drawPixel(x-dy,y+dx,c); drawPixel(x-dx,y+dy,c);
      drawPixel(x-dx,y-dy,c); drawPixel(x-dy,y-dx,c);
      drawPixel(x+dy,y-dx,c); drawPixel(x+dx,y-dy,c);
      dy++; if(e<0) e+=2*dy+1; else {dx--;e+=2*(dy-dx)+1;}
    }
  }
  void fillRoundRect(int x,int y,int w,int h,int r,uint16_t c) {
    r=min(r,min(w,h)/2);
    for(int j=0;j<h;j++) for(int i=0;i<w;i++) {
      int dx=i<r?r-i-1:(i>=w-r?i-(w-r):0);
      int dy=j<r?r-j-1:(j>=h-r?j-(h-r):0);
      if(dx*dx+dy*dy<=r*r) drawPixel(x+i,y+j,c);
    }
  }
  void drawTriangle(int a,int b,int c,int d,int e,int f,uint16_t color) {
    drawLine(a,b,c,d,color);drawLine(c,d,e,f,color);drawLine(e,f,a,b,color);
  }
  void fillTriangle(int ax,int ay,int bx,int by,int cx,int cy,uint16_t color) {
    auto edge=[](int x,int y,int a,int b,int c,int d){return (x-a)*(d-b)-(y-b)*(c-a);};
    if(edge(cx,cy,ax,ay,bx,by)==0) {drawTriangle(ax,ay,bx,by,cx,cy,color);return;}
    for(int y=0;y<32;y++) for(int x=0;x<32;x++) {
      int a=edge(x,y,ax,ay,bx,by),b=edge(x,y,bx,by,cx,cy),c=edge(x,y,cx,cy,ax,ay);
      if((a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0))drawPixel(x,y,color);
    }
  }
  void save(const std::string &path) {
    std::ofstream f(path,std::ios::binary); f<<"P6\n32 32\n255\n";
    for(auto &row:pixels) for(auto p:row) {
      unsigned char rgb[3]={(unsigned char)(((p>>11)&31)*255/31),
        (unsigned char)(((p>>5)&63)*255/63),(unsigned char)((p&31)*255/31)};
      f.write((char*)rgb,3);
    }
  }
} display;
void drawGlint(int x,int y,uint16_t c) {
  display.drawPixel(x,y,c);display.drawPixel(x-1,y,c);display.drawPixel(x+1,y,c);
  display.drawPixel(x,y-1,c);display.drawPixel(x,y+1,c);
}
