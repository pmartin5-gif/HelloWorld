void restState(unsigned long now) {
  // Six chickens, two equally good teams, trading baskets forever.
  const unsigned long t = now % 12000UL;
  const bool blueAttack = t < 6000;
  const int p = (int)(t % 6000UL);
  const uint16_t blue = display.color565(0, 135, 255);
  const uint16_t pink = display.color565(255, 25, 110);
  const uint16_t feather = display.color565(255, 230, 155);
  const uint16_t comb = display.color565(255, 35, 15);
  const uint16_t gold = display.color565(255, 170, 0);
  const uint16_t line = display.color565(20, 95, 85);
  const uint16_t net = display.color565(150, 220, 210);
  const uint16_t ballColor = display.color565(255, 95, 0);
  display.fillScreen(0);

  // Court lines leave black space around the six bold player silhouettes.
  display.drawRect(0, 9, 32, 23, line);
  display.drawFastVLine(16, 10, 21, line);
  display.drawCircle(16, 21, 4, line);
  display.drawRect(0, 16, 5, 10, line);
  display.drawRect(27, 16, 5, 10, line);

  // Small score at the top: blue gets ahead, pink answers, then repeat.
  auto digit = [&](int x, int y, int n, uint16_t color) {
    const uint8_t glyph[5][5] = {
      {7,5,5,5,7}, {2,6,2,2,7}, {7,1,7,4,7},
      {7,1,7,1,7}, {5,5,7,1,1}
    };
    for (int row=0; row<5; ++row)
      for (int col=0; col<3; ++col)
        if (glyph[n][row] & (4 >> col)) display.drawPixel(x+col,y+row,color);
  };
  const int round = (int)((now / 12000UL) % 2UL);
  int blueScore = round*2;
  int pinkScore = round*2;
  if (!blueAttack || p >= 4600) blueScore += 2;
  if (!blueAttack && p >= 4600) pinkScore += 2;
  digit(10, 1, blueScore, blue);
  digit(19, 1, pinkScore, pink);
  display.drawFastHLine(15, 3, 2, net);

  // A tiny chicken has a red comb, cream head, beak, jersey and yellow feet.
  auto chicken = [&](int x, int y, bool right, uint16_t shirt, int step, bool cheer) {
    const int d = right ? 1 : -1;
    display.fillRect(x-1, y-3, 3, 3, feather);
    display.drawPixel(x, y-4, comb);
    display.drawPixel(x-1, y-4, comb);
    display.drawPixel(x+d*2, y-2, gold);
    display.drawPixel(x+d, y-3, 0);
    display.fillRect(x-1, y, 3, 3, shirt);
    display.drawPixel(x-d*2, y, feather);
    display.drawPixel(x-d*3, y-1, feather);
    display.drawPixel(x+d*2, y+(cheer ? -1 : 1), feather);
    display.drawPixel(x-1-step, y+3, gold);
    display.drawPixel(x+1+step, y+3, gold);
  };
  // Reflect the same quality of play for the opposing possession.
  auto courtX = [&](int x) { return blueAttack ? x : 31-x; };
  const uint16_t offense = blueAttack ? blue : pink;
  const uint16_t defense = blueAttack ? pink : blue;
  const int shuffle = (p/230)%2;
  const int advance = p < 2100 ? p/1050 : 2;
  const bool scored = p >= 4600;
  const int hop = scored && ((p-4600)/220)%2 == 0 ? -1 : 0;
  // Three per team, staggered so every head and jersey remains visible.
  chicken(courtX(6+advance), 14+hop, blueAttack, offense, shuffle, scored);
  chicken(courtX(9+advance), 23+hop, blueAttack, offense, 1-shuffle, scored);
  chicken(courtX(5+advance), 28+hop, blueAttack, offense, shuffle, scored);
  chicken(courtX(21+shuffle), 14, !blueAttack, defense, 1-shuffle, false);
  chicken(courtX(21-shuffle), 23, !blueAttack, defense, shuffle, false);
  chicken(courtX(25-shuffle), 28, !blueAttack, defense, 1-shuffle, false);

  // Two short passes, a dribble, then a shot. The other team answers next.
  int bx=9, by=17;
  if (p < 900) {
    bx = 9+p*2/900;
    by = 16+p*5/900;
  } else if (p < 1800) {
    bx = 11-((p-900)*3/900);
    by = 21+((p-900)*5/900);
  } else if (p < 2800) {
    bx = 9;
    const int bounce = (p-1800)%500;
    by = 25+(bounce<250 ? bounce*3/250 : (500-bounce)*3/250);
  } else if (p < 4300) {
    const int q=p-2800;
    bx=9+q*20/1500;
    by=24-q*5/1500-(q*(1500-q)*28)/(1500*1500);
  } else if (p < 4600) {
    bx=29;
    by=19+(p-4300)*4/300;
  } else {
    bx=29-(p-4600)*4/1400;
    by=24;
  }
  bx=courtX(bx);
  display.fillCircle(bx,by,1,ballColor);
  display.drawPixel(bx,by,feather);

  // Side baskets stay visible in front of the ball when it drops through.
  display.drawFastVLine(0,15,6,net);
  display.drawFastHLine(1,20,4,ballColor);
  display.drawLine(1,21,2,23,net);
  display.drawLine(4,21,3,23,net);
  display.drawFastVLine(31,15,6,net);
  display.drawFastHLine(27,20,4,ballColor);
  display.drawLine(27,21,28,23,net);
  display.drawLine(30,21,29,23,net);
}