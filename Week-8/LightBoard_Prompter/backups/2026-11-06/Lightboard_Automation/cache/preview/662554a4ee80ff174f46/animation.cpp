void restState(unsigned long now) {
  // One sunlit tree overlooking the sea: rooted above gently passing waves.
  static bool initialized = false;
  static unsigned long previousTime = 0;
  static unsigned long animationTime = 0;
  unsigned long step = 33UL;
  if (initialized) {
    unsigned long gap = now - previousTime;
    step = gap <= 200UL ? gap : 33UL;
  } else {
    initialized = true;
  }
  previousTime = now;
  animationTime = (animationTime + step) % 24000UL;

  const float TAU = 6.28318530718f;
  float breeze = TAU * (animationTime % 6000UL) / 6000.0f;
  int sway = (int)roundf(sinf(breeze));
  uint16_t black = display.color565(0, 0, 0);
  uint16_t yellow = display.color565(255, 220, 0);
  uint16_t orange = display.color565(255, 110, 0);
  uint16_t green = display.color565(0, 190, 35);
  uint16_t leafLight = display.color565(65, 235, 0);
  uint16_t trunk = display.color565(200, 85, 0);
  uint16_t grass = display.color565(15, 150, 40);
  uint16_t rock = display.color565(85, 30, 150);
  uint16_t sea = display.color565(0, 85, 255);
  uint16_t crest = display.color565(0, 205, 255);

  display.fillScreen(black);

  // Clear sunshine, with black sky giving it room to glow.
  display.fillCircle(26, 6, 4, orange);
  display.fillCircle(26, 6, 3, yellow);
  display.drawFastHLine(24, 4, 3, display.color565(255, 245, 100));
  display.drawFastHLine(19, 6, 2, yellow);
  display.drawFastVLine(26, 0, 1, yellow);
  display.drawFastVLine(26, 12, 2, yellow);
  display.drawPixel(21, 1, yellow);
  display.drawPixel(31, 11, yellow);

  // Ocean below the tree. Two broad bands move at different rhythms.
  int wave = (animationTime / 200UL) % 8;
  int slowWave = (animationTime / 300UL) % 10;
  for (int x = 0; x < 32; x++) {
    int p = (x + wave) % 8;
    if (p < 6) {
      int y = p == 0 || p == 5 ? 25 : 24;
      display.drawPixel(x, y, crest);
      display.drawPixel(x, y + 1, sea);
    }
    int q = (x - slowWave + 20) % 10;
    if (q < 7) {
      int y = q == 0 || q == 6 ? 30 : 29;
      display.drawPixel(x, y, sea);
      if (q >= 2 && q <= 4) display.drawPixel(x, y - 1, crest);
    }
  }

  // A compact cliff makes the elevated viewpoint unmistakable.
  display.fillTriangle(0, 21, 10, 19, 18, 23, rock);
  display.fillTriangle(0, 21, 18, 23, 0, 28, rock);
  display.drawFastHLine(1, 21, 15, grass);
  display.drawFastHLine(3, 20, 9, grass);

  // A substantial trunk, rooted in the headland.
  display.fillRect(7, 12, 3, 9, trunk);
  display.drawLine(8, 16, 4, 12, trunk);
  display.drawLine(9, 15, 14, 11, trunk);
  display.drawLine(9, 16, 14, 12, trunk);

  // One spreading canopy. The trunk stays still as the leaf tips stir.
  display.fillCircle(4 + sway, 9, 4, green);
  display.fillCircle(9, 6, 5, green);
  display.fillCircle(14 + sway, 9, 4, green);
  display.fillRect(4, 8, 11, 5, green);
  display.drawFastHLine(6 + sway, 3, 5, leafLight);
  display.drawFastHLine(2 + sway, 7, 3, leafLight);
  display.drawFastHLine(13 + sway, 7, 3, leafLight);

  // A small black cleft keeps the canopy from becoming a single round blob.
  display.drawFastVLine(9, 12, 2, black);
}