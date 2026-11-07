void restState(unsigned long now) {
  // Thursday triptych: order, exuberance, and the place where both rhythms meet.
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
  float phase = TAU * (animationTime % 8000UL) / 8000.0f;
  uint16_t black = display.color565(0, 0, 0);
  uint16_t frame = display.color565(230, 115, 0);
  uint16_t blue = display.color565(0, 105, 255);
  uint16_t cyan = display.color565(0, 230, 240);
  uint16_t pink = display.color565(255, 0, 125);
  uint16_t red = display.color565(255, 35, 30);
  uint16_t gold = display.color565(255, 215, 0);
  uint16_t green = display.color565(25, 215, 0);

  display.fillScreen(black);

  // Three tall panels, divided by black gutters like a miniature altarpiece.
  const int left[3] = {0, 11, 22};
  for (int panel = 0; panel < 3; panel++) {
    int x = left[panel];
    display.drawFastVLine(x, 4, 26, frame);
    display.drawFastVLine(x + 9, 4, 26, frame);
    display.drawFastHLine(x, 29, 10, frame);
    display.drawFastHLine(x + 1, 3, 8, frame);
    display.drawFastHLine(x + 3, 2, 4, frame);
  }

  // Workday: little blue blocks move with strict, repeated spacing.
  int march = (animationTime / 350UL) % 8;
  for (int i = 0; i < 3; i++) {
    int y = 7 + ((i * 8 + march) % 21);
    if (y <= 25) {
      display.fillRect(2, y, 2, 3, blue);
      display.fillRect(6, y, 2, 3, cyan);
    }
  }
  display.drawFastVLine(4, 6, 21, blue);

  // Garden: an impossible pink fountain grows into bright, oversized fruit.
  int sway = (int)roundf(sinf(phase));
  display.drawLine(15, 27, 15 + sway, 12, green);
  display.drawLine(16, 27, 16 + sway, 12, green);
  display.drawLine(15, 21, 12, 18, green);
  display.drawLine(16, 23, 19, 20, green);
  display.fillCircle(15 + sway, 10, 2, pink);
  display.drawPixel(15 + sway, 7, gold);
  display.fillCircle(13, 17, 1, red);
  display.fillCircle(18, 19, 1, gold);
  display.drawFastHLine(13, 27, 5, pink);

  // The third world combines the garden's curves and the workday's geometry.
  // Its different rhythm lets the three panels coexist without becoming one.
  for (int y = 7; y < 27; y++) {
    int bend = (int)roundf(2.0f * sinf(phase * 2.0f + y * 0.30f));
    int x = 26 + bend;
    display.drawPixel(x, y, y % 5 < 2 ? pink : cyan);
    display.drawPixel(x + 1, y, y % 5 < 2 ? pink : blue);
  }
  int travelerY = 8 + (animationTime / 240UL) % 18;
  display.fillRect(25, travelerY, 3, 2, gold);

  // A small shared golden pulse connects the panels at their foundations.
  int focus = (animationTime / 1600UL) % 3;
  display.drawFastHLine(left[focus] + 3, 31, 4, gold);
}
