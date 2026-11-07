#include <cmath>
#include <cstdint>
#include <algorithm>
#include <fstream>
#include <string>
struct MockDisplay {
 uint16_t pixels[32][32] = {};
 uint16_t color565(int r,int g,int b){return ((r&248)<<8)|((g&252)<<3)|(b>>3);}
 void drawPixel(int x,int y,uint16_t c){if(x>=0&&x<32&&y>=0&&y<32)pixels[y][x]=c;}
 void fillScreen(uint16_t c){for(auto &row:pixels)for(auto &p:row)p=c;}
 void drawFastHLine(int x,int y,int w,uint16_t c){for(int i=0;i<w;i++)drawPixel(x+i,y,c);}
 void drawFastVLine(int x,int y,int h,uint16_t c){for(int i=0;i<h;i++)drawPixel(x,y+i,c);}
 void fillRect(int x,int y,int w,int h,uint16_t c){for(int i=0;i<h;i++)drawFastHLine(x,y+i,w,c);}
 void drawLine(int x,int y,int xx,int yy,uint16_t c){int dx=abs(xx-x),sx=x<xx?1:-1,dy=-abs(yy-y),sy=y<yy?1:-1,e=dx+dy;for(;;){drawPixel(x,y,c);if(x==xx&&y==yy)break;int ee=2*e;if(ee>=dy){e+=dy;x+=sx;}if(ee<=dx){e+=dx;y+=sy;}}}
 void fillTriangle(int ax,int ay,int bx,int by,int cx,int cy,uint16_t color){
  auto edge=[](int x,int y,int a,int b,int c,int d){return (x-a)*(d-b)-(y-b)*(c-a);};
  for(int y=0;y<32;y++)for(int x=0;x<32;x++){
   int a=edge(x,y,ax,ay,bx,by),b=edge(x,y,bx,by,cx,cy),c=edge(x,y,cx,cy,ax,ay);
   if((a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0))drawPixel(x,y,color);
  }
 }
 void save(const std::string &path){std::ofstream f(path,std::ios::binary);f<<"P6\n32 32\n255\n";for(auto &row:pixels)for(auto p:row){unsigned char rgb[3]={(unsigned char)(((p>>11)&31)*255/31),(unsigned char)(((p>>5)&63)*255/63),(unsigned char)((p&31)*255/31)};f.write((char*)rgb,3);}}
} display;
#include "lighthouse.cpp"
int main(){for(unsigned long i=0;i<243;i++){restState(i*33);if(i==30||i==90||i==150||i==210)display.save("incoming/lighthouse-"+std::to_string(i)+".ppm");}}
