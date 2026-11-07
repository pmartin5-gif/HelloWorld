void restState(unsigned long now) {
  // Managed resting animation; hardware and face effects are preserved.
  static bool initialized = false;
  static unsigned long previousTime = 0;
  static unsigned long animationTime = 0;

  unsigned long stepMs = 33UL;

  if (initialized) {
    unsigned long gap = now - previousTime;
    stepMs = gap <= 200UL ? gap : 33UL;
  } else {
    initialized = true;
  }

  previousTime = now;

  // Bounded time, with smoothly repeating motion.
  animationTime = (animationTime + stepMs) % 120000UL;

  const float TAU = 6.28318530718f;
  float phase = TAU * animationTime / 120000.0f;

  uint16_t black = display.color565(0, 0, 0);

  uint16_t houseBlue = display.color565(0, 190, 255);
  uint16_t doorBlue = display.color565(0, 125, 255);

  // Saturated fire colors, without grey or white washout.
  uint16_t fireColors[5] = {
    black,
    display.color565(255, 0, 30),
    display.color565(255, 45, 0),
    display.color565(255, 130, 0),
    display.color565(255, 220, 15)
  };

  display.fillScreen(black);

  // Draw a group of flames into a shared field first.
  // Overlapping flames reinforce each other instead of
  // painting dark edges over brighter flame centers.
  auto drawFire = [&](bool foreground) {
    uint8_t field[32][32] = {};

    const int flameCount = foreground ? 4 : 7;

    for (int i = 0; i < flameCount; i++) {
      float baseX;
      float baseHeight;
      float width;

      if (foreground) {
        // Flames climbing across the front of the house.
        baseX = 8.0f + i * 5.5f;
        baseHeight = 6.5f + (i % 2) * 2.0f;
        width = 3.2f;
      } else {
        // Tall flames surround the house.
        static const float positions[7] = {
          1.0f, 5.0f, 10.0f, 16.0f,
          22.0f, 27.0f, 31.0f
        };

        static const float heights[7] = {
          22.0f, 27.0f, 18.0f, 22.0f,
          18.0f, 27.0f, 23.0f
        };

        baseX = positions[i];
        baseHeight = heights[i];
        width = 3.7f;
      }

      float offset = foreground ? 2.3f : 0.0f;

      // Several overlapping rhythms prevent synchronized flames.
      float surge = sinf(
          phase * (47 + i * 7) + i * 1.7f + offset);

      float flicker = sinf(
          phase * (113 + i * 11) + i * 2.1f + offset);

      float height = baseHeight +
          (foreground ? 1.8f : 3.0f) * surge +
          1.2f * flicker;

      float lean = 2.5f * sinf(
          phase * (67 + i * 9) + i * 1.3f + offset);

      float curl = sinf(
          phase * (139 + i * 5) + i + offset);

      for (int y = 0; y < 32; y++) {
        float rise = (31.0f - y) / height;

        if (rise < 0.0f || rise >= 1.0f) {
          continue;
        }

        // Broad bases narrow into bent, pointed tongues.
        float center = baseX +
            lean * rise * rise +
            curl * sinf(rise * 5.0f) * rise;

        float halfWidth =
            width * (1.0f - rise) + 0.25f;

        int left = (int)floorf(center - halfWidth);
        int right = (int)ceilf(center + halfWidth);

        if (left < 0) left = 0;
        if (right > 31) right = 31;

        for (int x = left; x <= right; x++) {
          float across = fabsf(x - center) / halfWidth;

          if (across > 1.0f) {
            continue;
          }

          uint8_t heat = 1;

          if (across < 0.78f && rise < 0.88f) {
            heat = 2;
          }

          if (across < 0.52f && rise < 0.66f) {
            heat = 3;
          }

          if (across < 0.28f && rise < 0.38f) {
            heat = 4;
          }

          if (heat > field[y][x]) {
            field[y][x] = heat;
          }
        }
      }
    }

    for (int y = 0; y < 32; y++) {
      for (int x = 0; x < 32; x++) {
        if (field[y][x] != 0) {
          display.drawPixel(
              x, y, fireColors[field[y][x]]);
        }
      }
    }
  };

  // ------------------------- Fire behind the house -------------------------
  drawFire(false);

  // ------------------------- Clear house silhouette -------------------------
  // Black interior separates the house from the surrounding fire.
  display.fillTriangle(
      6, 15,
      16, 5,
      26, 15,
      black);

  display.fillRect(8, 15, 17, 15, black);

  // Two-pixel roof strokes.
  for (int thickness = 0; thickness < 2; thickness++) {
    display.drawLine(
        6, 15 + thickness,
        16, 5 + thickness,
        houseBlue);

    display.drawLine(
        16, 5 + thickness,
        26, 15 + thickness,
        houseBlue);
  }

  // Strong vertical walls and foundation.
  display.fillRect(8, 16, 2, 13, houseBlue);
  display.fillRect(23, 16, 2, 13, houseBlue);
  display.fillRect(8, 28, 17, 2, houseBlue);

  // One large doorway keeps the house immediately recognizable.
  display.fillRect(13, 20, 7, 9, doorBlue);
  display.fillRect(15, 22, 3, 7, black);

  // ------------------------- Fire across the front -------------------------
  // These smaller flames periodically swallow the foundation
  // and climb into the doorway without hiding the roof.
  drawFire(true);
}
