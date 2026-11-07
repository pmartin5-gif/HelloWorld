void restState(unsigned long now) {
  // Summer together: friends under a striped umbrella beside a lively sea.
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
  float phase = TAU * (animationTime % 6000UL) / 6000.0f;

  uint16_t black = display.color565(0, 0, 0);
  uint16_t yellow = display.color565(255, 220, 0);
  uint16_t sunEdge = display.color565(255, 115, 0);
  uint16_t shine = display.color565(255, 250, 135);
  uint16_t sea = display.color565(0, 100, 255);
  uint16_t foam = display.color565(0, 225, 255);
  uint16_t sand = display.color565(235, 135, 0);
  uint16_t pink = display.color565(255, 0, 115);
  uint16_t skin = display.color565(255, 175, 85);
  uint16_t green = display.color565(45, 235, 0);

  display.fillScreen(black);

  // A brilliant, uncomplicated summer sun.
  display.fillCircle(25, 5, 4, sunEdge);
  display.fillCircle(25, 5, 3, yellow);
  display.drawFastHLine(23, 3, 3, shine);
  for (int i = 0; i < 8; i++) {
    float a = TAU * i / 8.0f;
    int x = 25 + (int)roundf(6.0f * cosf(a));
    int y = 5 + (int)roundf(6.0f * sinf(a));
    display.drawPixel(x, y, yellow);
  }

  // Two clear moving wave bands; black gaps preserve individual crests.
  int wave = (animationTime / 220UL) % 8;
  for (int x = 0; x < 32; x++) {
    int crest = (x + wave) % 8;
    if (crest < 6) {
      int y = crest == 0 || crest == 5 ? 13 : 12;
      display.drawPixel(x, y, sea);
      if (crest >= 1 && crest <= 4) display.drawPixel(x, y - 1, foam);
    }
    if ((x - wave + 16) % 8 < 5) display.drawPixel(x, 16, sea);
  }

  // Small distant beachgoers: just heads and bodies, separated by black.
  for (int i = 0; i < 4; i++) {
    int x = 2 + i * 8;
    int bob = (int)roundf(0.6f * sinf(phase + i * 1.7f));
    display.drawPixel(x, 17 + bob, skin);
    display.drawFastVLine(x, 18 + bob, 2, i % 2 == 0 ? pink : foam);
  }

  // A few warm beach marks suggest sand without filling the background.
  display.drawFastHLine(1, 30, 6, sand);
  display.drawFastHLine(23, 30, 8, sand);
  display.drawFastHLine(20, 28, 3, sand);

  // Large striped umbrella: the central, instantly readable beach symbol.
  // Its canopy sits in front of the waves, its pole anchors the group.
  const int umbrellaX = 10;
  display.drawFastVLine(umbrellaX, 15, 16, shine);
  for (int row = 0; row < 7; row++) {
    int halfWidth = row + 1;
    int y = 7 + row;
    for (int dx = -halfWidth; dx <= halfWidth; dx++) {
      uint16_t color = abs(dx) <= row / 3 + 1 ? yellow : pink;
      display.drawPixel(umbrellaX + dx, y, color);
    }
  }
  display.drawFastHLine(2, 14, 17, pink);
  display.drawFastHLine(8, 14, 5, yellow);
  display.drawPixel(3, 15, pink);
  display.drawPixel(10, 15, yellow);
  display.drawPixel(17, 15, pink);

  // Three friends close together under the umbrella.
  const int friendX[3] = {5, 11, 17};
  const uint16_t shirts[3] = {foam, green, pink};
  for (int i = 0; i < 3; i++) {
    int x = friendX[i];
    int lift = sinf(phase + i * 0.8f) > 0.65f ? 1 : 0;
    int y = 21 - lift;
    display.fillRect(x - 1, y - 2, 3, 3, skin);
    display.fillRect(x - 1, y + 2, 3, 4, shirts[i]);
    display.drawLine(x - 1, y + 5, x - 2, 28, shirts[i]);
    display.drawLine(x + 1, y + 5, x + 2, 28, shirts[i]);
    // Linked arms give the crowd one clear emotional focus: being together.
    if (i < 2) display.drawLine(x + 2, y + 3, x + 4, 23, skin);
  }
}
