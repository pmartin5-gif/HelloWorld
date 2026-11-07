void restState(unsigned long now) {
  // A cautious peek: one seated woman leaning into an unknown, softly lit room.
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
  animationTime = (animationTime + step) % 10000UL;

  float peek = 0.0f;
  if (animationTime < 2200UL) {
    peek = smoothProgress(animationTime / 2200.0f);
  } else if (animationTime < 5500UL) {
    peek = 1.0f;
  } else if (animationTime < 7500UL) {
    peek = 1.0f - smoothProgress((animationTime - 5500UL) / 2000.0f);
  }

  uint16_t black = display.color565(0, 0, 0);
  uint16_t frame = display.color565(100, 25, 190);
  uint16_t warm = display.color565(210, 85, 0);
  uint16_t lamp = display.color565(255, 165, 30);
  uint16_t lightPool = display.color565(95, 30, 0);
  uint16_t dress = display.color565(145, 0, 180);
  uint16_t skin = display.color565(240, 140, 55);
  uint16_t hairRim = display.color565(50, 75, 170);

  display.fillScreen(black);

  // A tall doorway establishes the scene with just two substantial edges.
  display.fillRect(3, 2, 2, 27, frame);
  display.fillRect(3, 2, 16, 2, frame);
  display.fillRect(17, 4, 2, 23, frame);
  display.drawFastHLine(4, 29, 16, frame);

  // The room beyond remains mostly black.
  // A single warm lamp gives her something to look toward.
  display.fillTriangle(25, 10, 22, 14, 29, 14, warm);
  display.drawFastHLine(23, 14, 6, lamp);
  display.drawFastVLine(25, 15, 5, warm);
  display.drawFastHLine(23, 20, 5, warm);

  // A small patch of lamplight; no full-room background fill.
  display.fillTriangle(25, 21, 19, 27, 31, 27, lightPool);
  display.drawFastHLine(22, 26, 7, warm);

  // She sits sideways on the threshold, facing right into the room.
  int lean = (int)roundf(2.0f * peek);
  int headX = 11 + lean;
  int headY = 13;

  // Seated body: a bent waist, skirt, knee, and feet.
  display.fillTriangle(9, 18, 14, 19, 12, 25, dress);
  display.fillTriangle(9, 18, 12, 25, 7, 25, dress);
  display.fillRect(10, 24, 7, 3, dress);
  display.fillRect(15, 26, 2, 3, skin);
  display.fillRect(15, 28, 5, 2, hairRim);

  // Shoulder follows her slow forward lean.
  display.drawLine(10, 19, headX, 17, dress);
  display.drawLine(11, 20, headX + 1, 17, dress);
  display.drawLine(12, 19, 16, 22, skin);
  display.drawLine(12, 20, 16, 23, skin);
  display.drawFastHLine(14, 23, 4, skin);

  // Long hair and a bun give the compact silhouette a distinct character.
  display.fillRoundRect(headX - 3, headY - 4, 6, 10, 2, hairRim);
  display.fillRect(headX - 2, headY - 2, 4, 7, black);
  display.fillCircle(headX - 3, headY - 1, 1, hairRim);

  // Warm light catches only the right-facing profile.
  display.drawFastVLine(headX + 2, headY - 2, 5, skin);
  display.drawPixel(headX + 3, headY, skin);
  display.drawPixel(headX + 1, headY + 3, skin);

  // One black eye stays pointed into the room.
  display.drawPixel(headX + 2, headY - 1, black);
}