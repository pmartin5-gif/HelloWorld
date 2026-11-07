void restState(unsigned long now) {
  // A little blue pufferfish bracing against repeated, overwhelming noise.
  const unsigned long cycle = now % 6800UL;
  int age = -1;
  if (cycle >= 700 && cycle < 2300) age = (int)cycle - 700;
  if (cycle >= 2700 && cycle < 4300) age = (int)cycle - 2700;
  if (cycle >= 4700 && cycle < 6500) age = (int)cycle - 4700;
  const bool startled = age >= 0;
  const bool impact = startled && age < 550;
  int swell = 0;
  if (startled) {
    if (age < 160) swell = age * 3 / 160;
    else if (age < 950) swell = 3;
    else swell = max(0, 3 - (age - 950) / 220);
  }
  const int r = 8 + swell;
  const int shake = impact ? ((age / 85) % 2 == 0 ? -1 : 1) : 0;
  const int cx = 16 + shake;
  const int cy = 17 + ((!startled && (cycle / 350) % 2) ? 1 : 0);
  const uint16_t blue = display.color565(0, 75, 255);
  const uint16_t edge = display.color565(0, 190, 255);
  const uint16_t belly = display.color565(0, 140, 255);
  const uint16_t white = display.color565(200, 255, 255);
  const uint16_t noise = display.color565(255, 75, 10);
  display.fillScreen(0);

  // Broken angular sound marks press in from the otherwise black edges.
  if (impact || (startled && age >= 700 && age < 900)) {
    const int inset = (age / 120) % 2;
    display.drawLine(0, 5, 3 + inset, 8, noise);
    display.drawLine(3 + inset, 8, 1, 10, noise);
    display.drawLine(1, 10, 3 + inset, 12, noise);
    display.drawLine(31, 7, 28 - inset, 10, noise);
    display.drawLine(28 - inset, 10, 30, 12, noise);
    display.drawLine(30, 12, 28 - inset, 14, noise);
    display.drawLine(10, 0, 12, 3, noise);
    display.drawLine(12, 3, 14, 1, noise);
    display.drawLine(14, 1, 16, 3, noise);
  }

  // Small paddling fins and a full ring of substantial blue spines.
  const int fin = (cycle / 180) % 2;
  display.fillTriangle(cx-r+1, cy+1, cx-r-3, cy-1-fin, cx-r-2, cy+4, edge);
  display.fillTriangle(cx+r-1, cy+1, cx+r+3, cy-1+fin, cx+r+2, cy+4, edge);
  for (int i = 0; i < 12; ++i) {
    const float a = i * 6.2831853f / 12.0f;
    const float ca = cosf(a), sa = sinf(a);
    const int bx = cx + (int)roundf(ca * (r-1));
    const int by = cy + (int)roundf(sa * (r-1));
    const int tx = cx + (int)roundf(ca * (r+2));
    const int ty = cy + (int)roundf(sa * (r+2));
    const int dx = (int)roundf(-sa);
    const int dy = (int)roundf(ca);
    display.fillTriangle(bx+dx, by+dy, bx-dx, by-dy, tx, ty, edge);
  }
  display.fillCircle(cx, cy, r, edge);
  display.fillCircle(cx, cy, r-1, blue);
  // Broad blue belly, with a clean silhouette and only a few spots.
  for (int y = 2; y < r-1; ++y) {
    for (int x = -r+2; x <= r-2; ++x) {
      if (x*x + y*y <= (r-2)*(r-2)) display.drawPixel(cx+x, cy+y, belly);
    }
  }
  display.drawPixel(cx-5, cy+1, edge);
  display.drawPixel(cx+5, cy+2, edge);
  display.drawPixel(cx-3, cy+5, edge);
  display.drawPixel(cx+3, cy+6, edge);

  // Huge startled eyes and an open O; no smile or resolved ending.
  const int ey = cy-3;
  display.fillCircle(cx-4, ey, 3, white);
  display.fillCircle(cx+4, ey, 3, white);
  const int look = impact ? -shake : 0;
  display.fillCircle(cx-4+look, ey, 1, 0);
  display.fillCircle(cx+4+look, ey, 1, 0);
  display.drawLine(cx-6, ey-5, cx-3, ey-4, edge);
  display.drawLine(cx+3, ey-4, cx+6, ey-5, edge);
  display.fillCircle(cx, cy+4, startled ? 2 : 1, 0);
  if (startled) display.drawPixel(cx, cy+6, white);
}
