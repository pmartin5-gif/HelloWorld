void restState(unsigned long now) {
  // Three balanced river stones. Only their inner light moves, like a quiet breath.
  // Bounded phases keep the slow motion smooth through indefinite playback.
  const float phase = (float)(now % 12000UL) * 6.2831853f / 12000.0f;
  const float drift = sinf((float)(now % 24000UL) * 6.2831853f / 24000.0f);
  const float breath = 0.85f + 0.15f * sinf(phase);
  static const float cx[3] = {14.0f, 17.1f, 15.2f};
  static const float cy[3] = {7.0f, 15.5f, 24.7f};
  static const float rx[3] = {6.2f, 8.0f, 10.2f};
  static const float ry[3] = {4.2f, 4.3f, 4.8f};
  static const float lean[3] = {-0.20f, 0.23f, -0.12f};
  const float warmth = 0.5f + 0.5f * sinf(phase - 0.7f);

  display.fillScreen(0);
  for (int y = 1; y < 31; ++y) {
    for (int x = 1; x < 31; ++x) {
      int red = 0, green = 0, blue = 0;
      for (int stone = 0; stone < 3; ++stone) {
        const float v = ((float)y - cy[stone]) / ry[stone];
        const float u = ((float)x - cx[stone] - lean[stone] * ((float)y - cy[stone])) /
                        (rx[stone] * (1.0f + 0.06f * v));
        const float distance = u * u + v * v;
        if (distance > 1.48f) continue;
        int r, g, b;
        if (distance <= 1.0f) {
          // Amber rim, a broad luminous center, and a slowly wandering warm heart.
          const float edge = min(1.0f, (1.0f - distance) * 2.4f);
          const float lightX = u + 0.20f - drift * 0.07f;
          const float lightY = v + 0.22f;
          const float core = max(0.0f, 1.0f - 0.75f * lightX * lightX - 0.65f * lightY * lightY);
          const float light = (0.58f + 0.42f * edge) * breath;
          const float peach = stone == 1 ? 1.0f : 0.0f;
          r = (int)((205.0f + 45.0f * core) * light);
          g = (int)((91.0f + 116.0f * core - peach * 28.0f + 5.0f * warmth) * light);
          b = (int)((23.0f + 112.0f * core - peach * 28.0f + 7.0f * warmth) * light);
        } else {
          // A narrow warm halo; the surrounding panel remains completely black.
          const float halo = (1.48f - distance) / 0.48f;
          const float glow = halo * halo * breath;
          r = (int)(31.0f * glow);
          g = (int)(12.0f * glow);
          b = 0;
        }
        red = max(red, r);
        green = max(green, g);
        blue = max(blue, b);
      }
      if (red > 0) display.drawPixel(x, y, display.color565(red, green, blue));
    }
  }
}
