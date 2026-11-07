void restState(unsigned long now) {
  // Squinting into fine, windblown rain: discomfort without a heavy storm.
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
  float gustPhase = TAU * (animationTime % 6000UL) / 6000.0f;
  float gust = 0.5f - 0.5f * cosf(gustPhase);
  int tight = gust > 0.55f ? 1 : 0;
  int lean = gust > 0.72f ? 1 : 0;

  uint16_t black = display.color565(0, 0, 0);
  uint16_t face = display.color565(0, 220, 225);
  uint16_t rain = display.color565(0, 80, 255);
  uint16_t mist = display.color565(0, 150, 255);
  uint16_t pressure = display.color565(255, 65, 30);

  display.fillScreen(black);

  // Sparse small streaks travel mostly sideways, not straight downward.
  // Fixed paths and staggered positions keep the drizzle continuous.
  unsigned long drift = animationTime / 38UL;
  for (int i = 0; i < 19; i++) {
    int x = (int)((i * 17UL + drift) % 48UL) - 8;
    int y = (int)((i * 11UL + animationTime / 330UL) % 34UL) - 1;
    int length = i % 4 == 0 ? 3 : 2;

    // Keep a generous clear region around the expression.
    for (int j = 0; j < length; j++) {
      int px = x - j;
      int py = y - (j >= 2 ? 1 : 0);
      bool clearFace = px >= 4 && px <= 27 && py >= 8 && py <= 26;
      if (!clearFace) display.drawPixel(px, py, i % 3 == 0 ? mist : rain);
    }
  }

  // Two short gust marks, separated from the face by black space.
  int windHead = (int)((animationTime / 45UL) % 48UL) - 8;
  for (int i = 0; i < 2; i++) {
    int y = i == 0 ? 7 : 28;
    int x = windHead - i * 15;
    display.drawFastHLine(x - 5, y, 6, rain);
    display.drawPixel(x + 1, y - 1, rain);
  }

  // Bold inward-facing > < eyes broadcast a scrunched, squinting expression.
  int eyeY = 14;
  int eyeHeight = tight ? 1 : 2;
  for (int thickness = 0; thickness < 2; thickness++) {
    display.drawLine(6 + lean, eyeY - eyeHeight + thickness,
                     11 + lean, eyeY + thickness, face);
    display.drawLine(11 + lean, eyeY + thickness,
                     6 + lean, eyeY + eyeHeight + thickness, face);
    display.drawLine(25 + lean, eyeY - eyeHeight + thickness,
                     20 + lean, eyeY + thickness, face);
    display.drawLine(20 + lean, eyeY + thickness,
                     25 + lean, eyeY + eyeHeight + thickness, face);
  }

  // A tight, uneven mouth, always connected and two pixels thick.
  const int mouthY[5] = {23, 22, 23, 22, 23};
  for (int i = 0; i < 4; i++) {
    int x1 = 10 + lean + i * 3;
    int x2 = x1 + 3;
    for (int thickness = 0; thickness < 2; thickness++) {
      display.drawLine(x1, mouthY[i] + thickness,
                       x2, mouthY[i + 1] + thickness, face);
    }
  }

  // A compact T-shaped pressure mark sits above the eyes.
  // It contracts slightly during each stronger gust, without flashing.
  int markWidth = tight ? 7 : 9;
  int markLeft = 16 + lean - markWidth / 2;
  display.fillRect(markLeft, 2, markWidth, 2, pressure);
  display.fillRect(15 + lean, 4, 2, 5, pressure);
}
