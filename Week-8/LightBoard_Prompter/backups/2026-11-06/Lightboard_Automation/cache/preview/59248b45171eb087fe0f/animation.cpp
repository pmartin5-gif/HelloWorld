void restState(unsigned long now) {
  // Clear spring sunshine: an open sky and flowers stirring in a cool breeze.
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
  float rayPhase = TAU * (animationTime % 12000UL) / 12000.0f;

  uint16_t black = display.color565(0, 0, 0);
  uint16_t orange = display.color565(255, 115, 0);
  uint16_t yellow = display.color565(255, 225, 0);
  uint16_t sunlight = display.color565(255, 245, 100);
  uint16_t green = display.color565(30, 225, 0);
  uint16_t leaf = display.color565(0, 160, 65);
  uint16_t pink = display.color565(255, 0, 110);
  uint16_t blue = display.color565(0, 170, 255);
  uint16_t center = display.color565(255, 205, 0);

  // Unlit space keeps the sunny silhouettes clear on the LED panel.
  display.fillScreen(black);

  // A large, steady sun, with gently lengthening rays.
  const int sunX = 19;
  const int sunY = 9;
  display.fillCircle(sunX, sunY, 6, orange);
  display.fillCircle(sunX, sunY, 5, yellow);
  display.drawFastHLine(sunX - 2, sunY - 3, 4, sunlight);

  for (int i = 0; i < 8; i++) {
    float angle = TAU * i / 8.0f;
    int length = sinf(rayPhase + i * 0.8f) > 0.0f ? 10 : 9;
    int x1 = sunX + (int)roundf(cosf(angle) * 8.0f);
    int y1 = sunY + (int)roundf(sinf(angle) * 8.0f);
    int x2 = sunX + (int)roundf(cosf(angle) * length);
    int y2 = sunY + (int)roundf(sinf(angle) * length);
    display.drawLine(x1, y1, x2, y2, orange);
  }

  // Three distinct flowers give the warmth a springtime character.
  const int rootX[3] = {5, 16, 27};
  const int bloomY[3] = {23, 25, 23};
  const uint16_t petals[3] = {pink, sunlight, blue};

  for (int i = 0; i < 3; i++) {
    int sway = (int)roundf(sinf(breeze + i * 0.65f));
    int x = rootX[i] + sway;
    int y = bloomY[i];

    // Rooted stems bend slightly rather than shifting the whole plant.
    display.drawLine(rootX[i], 31, x, y + 2, green);
    display.drawLine(rootX[i] + 1, 31, x + 1, y + 2, green);

    int leafY = y + 5;
    display.drawLine(rootX[i], leafY, rootX[i] - 2, leafY - 1, leaf);
    display.drawPixel(rootX[i] - 2, leafY - 2, green);
    display.drawLine(rootX[i] + 1, leafY + 1, rootX[i] + 3, leafY, leaf);

    // Chunky, four-petal blooms with a strong contrasting center.
    display.fillRect(x - 1, y - 3, 2, 2, petals[i]);
    display.fillRect(x - 1, y + 1, 2, 2, petals[i]);
    display.fillRect(x - 3, y - 1, 2, 2, petals[i]);
    display.fillRect(x + 1, y - 1, 2, 2, petals[i]);
    display.fillRect(x - 1, y - 1, 2, 2, center);
  }
}