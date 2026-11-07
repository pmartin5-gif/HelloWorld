void restState(unsigned long now) {
  // Reflected care: one cooking heart, echoed in warm wooden mirrors.
  static bool initialized = false;
  static unsigned long previousTime = 0;
  static unsigned long animationTime = 0;
  static unsigned long arrivalTime = 0;
  unsigned long step = 33UL;
  if (initialized) {
    unsigned long gap = now - previousTime;
    step = gap <= 200UL ? gap : 33UL;
  } else {
    initialized = true;
  }
  previousTime = now;
  animationTime = (animationTime + step) % 48000UL;
  if (arrivalTime < 3000UL) arrivalTime = min(3000UL, arrivalTime + step);

  const float TAU = 6.28318530718f;
  float beat = TAU * (animationTime % 2400UL) / 2400.0f;
  float echo = 0.45f * (1.0f - cosf(TAU * (animationTime % 16000UL) / 16000.0f));

  uint16_t black = display.color565(0, 0, 0);
  uint16_t wood = display.color565(255, 125, 0);
  uint16_t glass = display.color565(0, 180, 255);
  uint16_t pink = display.color565(255, 0, 95);
  uint16_t gold = display.color565(255, 205, 20);
  uint16_t pot = display.color565(0, 165, 255);
  uint16_t rim = display.color565(0, 235, 255);

  display.fillScreen(black);

  // Two wood-framed mirrors; their black interiors leave room for reflections.
  for (int i = 0; i < 2; i++) {
    int x = i == 0 ? 0 : 21;
    display.fillRoundRect(x, 2, 11, 14, 2, wood);
    display.fillRect(x + 1, 4, 9, 10, black);
    display.drawLine(x + 2, 6, x + 4, 4, glass);
  }

  // A broad cooking pot anchors the scene in a kitchen.
  display.fillRect(11, 24, 11, 5, pot);
  display.fillRect(12, 29, 9, 1, pot);
  display.drawFastHLine(10, 23, 13, rim);
  display.fillRect(8, 24, 3, 2, rim);
  display.fillRect(22, 24, 3, 2, rim);
  display.drawFastHLine(12, 25, 3, rim);

  // Warm stove below, with black separating it from the pot.
  display.drawFastHLine(12, 31, 9, wood);

  static const char heart[6][8] = {
    "0110110",
    "1111111",
    "1111111",
    "0111110",
    "0011100",
    "0001000"
  };

  auto drawHeart = [&](float cx, float cy, float scale, uint16_t color) {
    if (scale <= 0.05f) return;
    for (int y = 0; y < 32; y++) {
      for (int x = 0; x < 32; x++) {
        int sx = (int)floorf((x - cx) / scale + 3.5f);
        int sy = (int)floorf((y - cy) / scale + 3.0f);
        if (sx >= 0 && sx < 7 && sy >= 0 && sy < 6 && heart[sy][sx] == '1') {
          display.drawPixel(x, y, color);
        }
      }
    }
  };

  // The main heart rises gently from the cooking pot.
  float pulse = 0.5f + 0.5f * sinf(beat);
  drawHeart(16.0f, 17.5f - pulse, 1.0f + 0.20f * pulse, pink);

  // Reflections appear in sequence, then repeatedly find a shared rhythm.
  if (arrivalTime >= 350UL) {
    float reveal = smoothProgress((arrivalTime - 350UL) / 500.0f);
    float reflectedPulse = 0.5f + 0.5f * sinf(beat - echo);
    drawHeart(5.0f, 9.0f, reveal * (0.70f + 0.16f * reflectedPulse), pink);
  }
  if (arrivalTime >= 1000UL) {
    float reveal = smoothProgress((arrivalTime - 1000UL) / 500.0f);
    float reflectedPulse = 0.5f + 0.5f * sinf(beat - 2.0f * echo);
    drawHeart(26.0f, 9.0f, reveal * (0.70f + 0.16f * reflectedPulse), gold);
  }
}
