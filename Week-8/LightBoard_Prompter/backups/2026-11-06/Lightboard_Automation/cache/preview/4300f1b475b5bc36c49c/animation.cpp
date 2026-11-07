void restState(unsigned long now) {
  // Warm wind: racing clouds, curling gusts, and persistent sunshine.
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
  animationTime = (animationTime + step) % 48000UL;

  const float TAU = 6.28318530718f;
  float phase = TAU * (animationTime % 8000UL) / 8000.0f;
  uint16_t black = display.color565(0, 0, 0);
  uint16_t orange = display.color565(255, 105, 0);
  uint16_t yellow = display.color565(255, 220, 0);
  uint16_t sunlight = display.color565(255, 245, 100);
  uint16_t cloudWhite = display.color565(205, 245, 255);
  uint16_t cloudBlue = display.color565(0, 145, 255);
  uint16_t wind = display.color565(0, 225, 200);

  display.fillScreen(black);

  // The sun holds its ground: warm and unmistakable, never extinguished.
  const int sunX = 23;
  const int sunY = 7;
  display.fillCircle(sunX, sunY, 5, orange);
  display.fillCircle(sunX, sunY, 4, yellow);
  display.drawFastHLine(21, 5, 3, sunlight);

  // Short, substantial rays breathe outward rather than flash.
  int reach = 7 + (sinf(phase * 2.0f) > 0.45f ? 1 : 0);
  for (int i = 0; i < 8; i++) {
    float angle = TAU * i / 8.0f;
    int x1 = sunX + (int)roundf(cosf(angle) * 7.0f);
    int y1 = sunY + (int)roundf(sinf(angle) * 7.0f);
    int x2 = sunX + (int)roundf(cosf(angle) * reach);
    int y2 = sunY + (int)roundf(sinf(angle) * reach);
    display.drawLine(x1, y1, x2, y2, orange);
  }

  // Broad cloud silhouettes race past, occasionally brushing the sun.
  // Their upper lobes are bright, with a saturated blue underside.
  for (int i = 0; i < 2; i++) {
    unsigned long cloudTime = (animationTime + i * 4000UL) % 8000UL;
    int x = (int)(cloudTime * 0.008f) - 16;
    int y = i == 0 ? 13 : 17;
    y += (int)roundf(sinf(phase + i * 2.0f));

    display.fillRect(x - 6, y, 15, 3, cloudBlue);
    display.fillCircle(x - 4, y, 3, cloudWhite);
    display.fillCircle(x, y - 2, 4, cloudWhite);
    display.fillCircle(x + 5, y - 1, 3, cloudWhite);
    display.fillRect(x - 5, y - 1, 12, 3, cloudWhite);
  }

  // Long, flowing gusts sweep left to right across the lower display.
  // Black gaps keep the two ribbons separated and easy to read.
  for (int i = 0; i < 2; i++) {
    unsigned long gustTime = (animationTime + i * 1600UL) % 3200UL;
    int head = (int)(gustTime * 0.01875f) - 8;
    int baseY = i == 0 ? 23 : 29;
    float bend = phase * 3.0f + i * 1.8f;
    int previousX = 0;
    int previousY = 0;

    for (int segment = 0; segment < 18; segment++) {
      int x = head - 17 + segment;
      int y = baseY + (int)roundf(
          1.5f * sinf(segment * 0.23f + bend));

      if (segment > 0) {
        display.drawLine(previousX, previousY, x, y, wind);
        if (segment >= 7) {
          display.drawLine(previousX, previousY + 1, x, y + 1, wind);
        }
      }
      previousX = x;
      previousY = y;
    }

    // A small curled tip makes the gust read as moving air.
    display.drawPixel(head + 1, previousY - 1, wind);
    display.drawPixel(head + 1, previousY - 2, wind);
    display.drawPixel(head, previousY - 3, wind);
    display.drawPixel(head - 1, previousY - 3, wind);
  }
}