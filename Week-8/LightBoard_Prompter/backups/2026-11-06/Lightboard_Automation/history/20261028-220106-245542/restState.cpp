void restState(unsigned long now) {
  // A solitary lighthouse: a steady tower and a patient searching beam.
  static bool initialized = false;
  static unsigned long previousTime = 0;
  static unsigned long animationTime = 0;

  unsigned long stepMs = 33UL;
  if (initialized) {
    unsigned long gap = now - previousTime;
    stepMs = gap <= 200UL ? gap : 33UL;
  } else {
    initialized = true;
  }
  previousTime = now;
  animationTime = (animationTime + stepMs) % 24000UL;

  const float TAU = 6.28318530718f;
  float sweep = TAU * (animationTime % 8000UL) / 8000.0f;

  uint16_t black = display.color565(0, 0, 0);
  uint16_t white = display.color565(185, 230, 255);
  uint16_t red = display.color565(255, 15, 35);
  uint16_t rock = display.color565(65, 0, 150);
  uint16_t sea = display.color565(0, 65, 255);
  uint16_t crest = display.color565(0, 180, 255);
  uint16_t twilight = display.color565(145, 0, 210);
  uint16_t amber = display.color565(255, 85, 0);
  uint16_t gold = display.color565(255, 185, 15);
  uint16_t lamp = display.color565(255, 245, 150);

  display.fillScreen(black);

  // One broken violet horizon suggests the last light of twilight.
  // Most of the sky stays completely unlit.
  display.drawFastHLine(19, 24, 7, twilight);
  display.drawFastHLine(28, 24, 4, twilight);

  // A broad, sharply defined beam searches the empty sky.
  // It travels slowly, lingering at each end of its sweep.
  float slope = 0.12f + 0.58f * sinf(sweep);
  float beamWidth = 0.72f + 0.28f * cosf(sweep);

  for (int x = 14; x < 32; x++) {
    float distance = x - 13.0f;
    float middle = 8.0f + slope * distance;
    float halfWidth = (0.35f + distance * 0.19f) * beamWidth;

    int top = (int)ceilf(middle - halfWidth);
    int bottom = (int)floorf(middle + halfWidth);

    for (int y = top; y <= bottom; y++) {
      if (y < 0 || y >= 24) continue;
      float across = fabsf(y - middle);
      display.drawPixel(x, y,
          across <= halfWidth * 0.46f ? gold : amber);
    }
  }

  // A few substantial wave crests roll past the stationary tower.
  // Their motion is continuous, with no storm or dramatic resolution.
  int seaStep = (animationTime / 200UL) % 8;

  for (int x = 0; x < 32; x++) {
    int upper = (x + seaStep) % 8;
    int lower = (x - seaStep + 16) % 8;

    if (upper < 5) {
      int y = upper == 0 || upper == 4 ? 28 : 27;
      display.drawPixel(x, y, sea);
      if (upper >= 1 && upper <= 3) {
        display.drawPixel(x, y, crest);
      }
    }

    if (lower < 5) {
      int y = lower == 0 || lower == 4 ? 31 : 30;
      display.drawPixel(x, y, sea);
    }
  }

  // A single solid headland anchors the lighthouse above the water.
  display.fillTriangle(0, 28, 7, 24, 16, 29, rock);
  display.fillTriangle(0, 28, 16, 29, 19, 31, rock);
  display.fillTriangle(0, 28, 19, 31, 0, 31, rock);
  display.drawFastHLine(4, 26, 10, black);

  // Tapered red-and-white tower. Bold bands make it recognizable.
  for (int y = 12; y <= 25; y++) {
    int halfWidth = 2 + (y - 12) / 6;
    bool redBand = (y >= 17 && y <= 19) || y >= 23;
    display.drawFastHLine(10 - halfWidth, y,
                         halfWidth * 2 + 1, redBand ? red : white);
  }

  // A dark doorway gives the tower an architectural scale.
  display.fillRect(9, 23, 3, 3, black);

  // Lantern housing, pointed roof, and a wide balcony.
  display.fillRect(7, 6, 7, 5, red);
  display.fillRect(8, 7, 5, 3, gold);
  display.drawFastVLine(10, 7, 3, lamp);
  display.fillTriangle(6, 5, 10, 2, 14, 5, red);
  display.drawFastHLine(5, 11, 11, white);

  // The lantern stays lit through the whole cycle: a silent vigil.
  display.drawPixel(13, 8, lamp);
}
