void restState(unsigned long now) {
  // Forest sky: a clear blue opening framed by gently stirring treetops.
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
  uint16_t sky = display.color565(0, 85, 225);
  uint16_t leaves = display.color565(0, 155, 35);
  uint16_t leafLight = display.color565(65, 225, 0);
  uint16_t wood = display.color565(155, 65, 0);
  uint16_t sun = display.color565(235, 185, 25);

  display.fillScreen(black);

  // A single uninterrupted opening of blue sky.
  // Black gaps around its edge separate sky, branches, and foliage.
  static const uint8_t openingLeft[21] = {
    13,11,10,9,8,7,7,6,6,6,7,7,8,8,9,10,11,12,13,14,15
  };
  static const uint8_t openingRight[21] = {
    21,23,24,25,25,26,26,26,26,26,25,25,24,24,23,23,22,21,20,19,18
  };
  for (int row = 0; row < 21; row++) {
    display.drawFastHLine(openingLeft[row], row + 2,
        openingRight[row] - openingLeft[row] + 1, sky);
  }

  // A modest sun: small, steady, and without flashing rays.
  display.fillCircle(20, 8, 2, sun);

  // Trunks and rising branches make the viewpoint clearly a forest.
  display.fillRect(1, 17, 3, 15, wood);
  display.fillRect(28, 15, 3, 17, wood);
  display.drawLine(3, 24, 8, 18, wood);
  display.drawLine(3, 25, 8, 19, wood);
  display.drawLine(29, 22, 24, 17, wood);
  display.drawLine(29, 23, 24, 18, wood);
  display.drawLine(3, 17, 7, 13, wood);
  display.drawLine(29, 16, 26, 12, wood);

  // Hand-shaped leaf clusters, separated by purposeful black spaces.
  static const char cluster[7][8] = {
    "0011100",
    "0111110",
    "1111111",
    "1111111",
    "0111111",
    "0011110",
    "0001100"
  };

  auto canopy = [&](int cx, int cy, bool mirror, int sway) {
    for (int sy = 0; sy < 7; sy++) {
      for (int sx = 0; sx < 7; sx++) {
        int sourceX = mirror ? 6 - sx : sx;
        if (cluster[sy][sourceX] != '1') continue;
        int px = cx + sx - 3;
        int py = cy + sy - 3;
        // Only the outer leaf tips stir, keeping the main canopy rooted.
        if (sy <= 1) px += sway;
        uint16_t color = sy <= 1 ? leafLight : leaves;
        display.drawPixel(px, py, color);
      }
    }
  };

  int leftSway = (int)roundf(sinf(phase));
  int rightSway = (int)roundf(sinf(phase + 1.3f));

  canopy(1, 3, false, leftSway);
  canopy(7, 0, true, leftSway);
  canopy(1, 11, true, leftSway);
  canopy(5, 17, false, leftSway);
  canopy(27, 1, true, rightSway);
  canopy(31, 7, false, rightSway);
  canopy(30, 15, true, rightSway);
  canopy(26, 20, false, rightSway);

  // A low foreground cluster frames the bottom without filling it in.
  canopy(8, 28, true, leftSway);
  canopy(22, 29, false, rightSway);
}
