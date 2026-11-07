void restState(unsigned long now) {
  // Tactile beach sand: a hand presses in, grains slip, a small wash recedes.
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
  animationTime = (animationTime + step) % 12000UL;

  float press = 0.0f;
  if (animationTime < 2000UL) press = smoothProgress(animationTime / 2000.0f);
  else if (animationTime < 6500UL) press = 1.0f;
  else if (animationTime < 8500UL) press = 1.0f - smoothProgress((animationTime - 6500UL) / 2000.0f);

  uint16_t black = display.color565(0, 0, 0);
  uint16_t sand = display.color565(220, 125, 15);
  uint16_t grain = display.color565(255, 205, 55);
  uint16_t wet = display.color565(150, 65, 0);
  uint16_t skin = display.color565(255, 165, 80);
  uint16_t touch = display.color565(255, 210, 120);
  uint16_t water = display.color565(0, 110, 235);
  uint16_t edge = display.color565(0, 210, 235);

  display.fillScreen(black);

  // A compact patch of sand, with black around it rather than a filled screen.
  for (int y = 7; y <= 29; y++) {
    int inset = y < 10 ? 10 - y : (y > 27 ? y - 27 : 0);
    display.drawFastHLine(2 + inset, y, 28 - 2 * inset, sand);
  }

  // Large, stable flecks make the material read as grains, not visual noise.
  for (int i = 0; i < 24; i++) {
    int x = 4 + ((i * 11 + 3) % 24);
    int y = 9 + ((i * 7 + i / 3) % 18);
    display.drawPixel(x, y, (i % 3) == 0 ? black : grain);
  }

  // Moist sand at the lower edge catches a slow wash of blue water.
  float tide = 0.5f - 0.5f * cosf(6.28318530718f * animationTime / 12000.0f);
  int waterTop = 31 - (int)roundf(3.0f * tide);
  for (int x = 2; x < 30; x++) {
    int scallop = ((x + animationTime / 500UL) % 9) < 3 ? 1 : 0;
    int y = waterTop + scallop;
    display.drawFastVLine(x, y, 32 - y, water);
    display.drawPixel(x, y, edge);
    if (y > 27) display.drawPixel(x, y - 1, wet);
  }

  // A hand-shaped hollow in the sand remains visible around the pressing hand.
  // Five separated fingers and a broad palm are the central silhouette.
  int sink = (int)roundf(2.0f * press);
  const int fingerX[4] = {10, 13, 16, 19};
  const int fingerTop[4] = {10, 7, 6, 9};

  // The dark outline supplies readable gaps between fingers.
  display.fillRoundRect(8, 16, 15, 11, 3, black);
  for (int i = 0; i < 4; i++) {
    display.fillRoundRect(fingerX[i] - 1, fingerTop[i] + sink - 1,
                         4, 15 - fingerTop[i], 1, black);
  }
  display.fillRoundRect(22, 17 + sink, 5, 7, 2, black);

  // Warm, solid shapes, with fingertips slightly buried as pressure increases.
  display.fillRoundRect(10, 17 + sink, 11, 8, 2, skin);
  display.fillRect(12, 24 + sink, 7, 7 - sink, skin);
  for (int i = 0; i < 4; i++) {
    int top = fingerTop[i] + sink;
    display.fillRoundRect(fingerX[i], top, 2, 20 - top, 1, skin);
    display.drawFastHLine(fingerX[i], top, 2, touch);
  }
  display.fillRoundRect(21, 18 + sink, 4, 5, 1, skin);
  display.drawFastVLine(11, 19 + sink, 3, touch);

  // A few distinct grains slide away from the fingers during the press.
  for (int i = 0; i < 5; i++) {
    float progress = ((animationTime + i * 330UL) % 2200UL) / 2200.0f;
    if (press < 0.15f || progress > 0.75f) continue;
    int side = i % 2 == 0 ? -1 : 1;
    int x = (side < 0 ? 7 : 25) + side * (int)roundf(progress * 3.0f);
    int y = 16 + i * 2 + (int)roundf(progress * 3.0f);
    if (y < 28) display.drawPixel(x, y, grain);
  }
}