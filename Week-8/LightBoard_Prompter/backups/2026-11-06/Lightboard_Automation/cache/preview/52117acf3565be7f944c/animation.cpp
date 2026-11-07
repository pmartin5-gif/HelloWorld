void restState(unsigned long now) {
  // A sheltered nook: warm light within a clear boundary, nature just outside.
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
  float breath = 0.5f - 0.5f * cosf(TAU * (animationTime % 8000UL) / 8000.0f);
  int sway = (int)roundf(sinf(TAU * (animationTime % 6000UL) / 6000.0f));

  uint16_t black = display.color565(0, 0, 0);
  uint16_t wall = display.color565(255, 130, 0);
  uint16_t wood = display.color565(175, 70, 0);
  uint16_t leaf = display.color565(0, 185, 45);
  uint16_t leafLight = display.color565(70, 230, 0);
  uint16_t seat = display.color565(0, 160, 200);
  uint16_t cushion = display.color565(0, 230, 195);
  uint16_t lamp = display.color565(255, 190 + (int)roundf(35.0f * breath), 35);
  uint16_t glow = display.color565(150 + (int)roundf(25.0f * breath), 55, 0);

  display.fillScreen(black);

  // A single tree outside the shelter, separated by black space.
  display.fillRect(3, 16, 2, 15, wood);
  display.drawLine(4, 20, 7, 15, wood);
  display.fillCircle(3 + sway, 10, 4, leaf);
  display.fillCircle(1, 15, 3, leaf);
  display.fillCircle(6 + sway, 14, 3, leaf);
  display.drawFastHLine(1 + sway, 8, 3, leafLight);
  display.drawFastHLine(5 + sway, 12, 2, leafLight);

  // Three substantial sides create a readable, embracing boundary.
  // The open left side looks toward the tree, not an endless empty landscape.
  display.fillRect(10, 3, 21, 2, wall);
  display.fillRect(29, 5, 2, 24, wall);
  display.fillRect(10, 29, 21, 2, wall);
  display.fillRect(10, 5, 2, 6, wall);
  display.fillRect(10, 22, 2, 7, wall);

  // A compact reading lamp supplies warm light without filling the room.
  display.fillTriangle(24, 10, 21, 14, 27, 14, lamp);
  display.drawFastVLine(24, 15, 8, wood);
  display.drawFastHLine(22, 23, 6, wood);
  display.fillTriangle(24, 24, 18, 28, 28, 28, glow);

  // A broad, soft chair: the place where you can settle safely inside.
  display.fillRoundRect(14, 18, 6, 8, 2, seat);
  display.fillRect(15, 23, 8, 4, seat);
  display.fillRect(14, 21, 2, 6, cushion);
  display.drawFastHLine(16, 23, 5, cushion);
  display.drawFastVLine(16, 27, 2, wood);
  display.drawFastVLine(21, 27, 2, wood);

  // One minimal framed artwork, with black giving its simple leaf room to read.
  display.drawRect(14, 7, 6, 7, wood);
  display.drawLine(16, 12, 18, 9, leafLight);
  display.drawPixel(16, 10, leaf);
  display.drawPixel(18, 11, leaf);
}