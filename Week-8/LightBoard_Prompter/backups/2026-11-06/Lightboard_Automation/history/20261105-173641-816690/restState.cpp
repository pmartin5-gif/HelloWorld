void restState(unsigned long now) {
  // A patient sloth with a very good set shot. Long arms, grounded feet.
  const unsigned long t = now % 6400UL;
  const uint16_t fur = display.color565(155, 100, 45);
  const uint16_t light = display.color565(235, 185, 100);
  const uint16_t mask = display.color565(65, 35, 15);
  const uint16_t cream = display.color565(255, 225, 160);
  const uint16_t jersey = display.color565(0, 165, 150);
  const uint16_t orange = display.color565(255, 100, 0);
  const uint16_t white = display.color565(180, 220, 255);
  display.fillScreen(0);

  // A small, readable half court: basket on the right, player on the left.
  display.drawFastHLine(2, 30, 28, display.color565(40, 75, 100));
  display.drawFastVLine(30, 4, 26, white);
  display.fillRect(28, 3, 2, 8, white);
  display.drawFastHLine(24, 11, 6, orange);
  display.drawLine(24, 12, 25, 16, white);
  display.drawLine(29, 12, 28, 16, white);
  display.drawFastHLine(25, 16, 4, white);
  display.drawLine(26, 12, 27, 15, white);
  display.drawLine(28, 12, 26, 15, white);

  // Short legs stay planted; the reach comes from those wonderfully long arms.
  display.fillRoundRect(7, 17, 7, 9, 2, fur);
  display.fillRect(7, 19, 7, 5, jersey);
  display.drawFastVLine(10, 20, 3, cream);
  display.fillRect(7, 25, 3, 4, fur);
  display.fillRect(12, 25, 3, 4, fur);
  display.drawFastHLine(6, 29, 4, light);
  display.drawFastHLine(12, 29, 4, light);

  int bx = 17, by = 23;
  int handX = 15, handY = 23;
  const bool released = t >= 2600;
  if (t < 1600) {
    // One gentle, deliberately slow dribble.
    const int d = t < 800 ? (int)t : 1600-(int)t;
    by = 22 + d*5/800;
  } else if (t < 2600) {
    const int p = (int)t-1600;
    bx = 17-p*3/1000;
    by = 22-p*15/1000;
    handX = bx-1;
    handY = by+2;
  } else {
    handX = 14;
    handY = 9;
    if (t < 4000) {
      // A high arc drops squarely into the rim, never a dunk.
      const int p = (int)t-2600;
      bx = 14+p*12/1400;
      by = 7+p*4/1400-(p*(1400-p)*16)/(1400*1400);
    } else if (t < 4600) {
      bx = 26;
      by = 11+((int)t-4000)*12/600;
    } else if (t < 5500) {
      const int p = (int)t-4600;
      bx = 26-p*9/900;
      by = 23+(p < 450 ? p*4/450 : (900-p)*4/450);
    } else {
      bx = 17;
      by = 23;
      handX = 15;
      handY = 23;
    }
  }
  // Two long, bent arms frame the shot without hiding the sloth's face.
  auto arm = [&](int sx, int sy, int ex, int ey, int hx, int hy) {
    display.drawLine(sx, sy, ex, ey, fur);
    display.drawLine(sx+1, sy, ex+1, ey, fur);
    display.drawLine(ex, ey, hx, hy, light);
    display.drawLine(ex+1, ey, hx+1, hy, light);
    display.drawPixel(hx, hy-1, cream);
    display.drawPixel(hx+2, hy, cream);
  };
  if (t >= 1600 && t < 5500) {
    arm(7, 19, 3, 12, handX-2, handY);
    arm(13, 19, 19, 16, handX+1, handY);
  } else {
    arm(7, 19, 3, 23, 4, 27);
    arm(13, 19, 17, 21, 16, 24);
  }

  // Cream face, droopy dark eye patches, tiny nose and an easy little smile.
  display.fillCircle(10, 13, 5, fur);
  display.fillRoundRect(6, 10, 9, 7, 3, cream);
  display.drawLine(6, 11, 9, 13, mask);
  display.drawLine(6, 12, 8, 13, mask);
  display.drawLine(11, 13, 14, 11, mask);
  display.drawLine(12, 13, 14, 12, mask);
  display.drawPixel(8, 12, 0);
  display.drawPixel(12, 12, 0);
  display.drawPixel(10, 14, mask);
  display.drawFastHLine(9, 16, 3, mask);
  if (t >= 4300 && t < 5200) {
    // A quiet satisfied blink as the basket lands.
    display.drawFastHLine(7, 12, 2, mask);
    display.drawFastHLine(12, 12, 2, mask);
  }

  display.fillCircle(bx, by, 2, orange);
  display.drawFastVLine(bx, by-2, 5, mask);
  display.drawFastHLine(bx-2, by, 5, mask);
  // The ball passes behind the front rim at the moment it drops through.
  if (t >= 3900 && t < 4200) display.drawFastHLine(24, 11, 6, orange);
}
