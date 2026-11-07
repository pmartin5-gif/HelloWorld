void restState(unsigned long now) {
  // A fine blue-white line carries a swelling pulse from left to right.
  // Per-pixel intensity gives the light its breath without changing panel setup.
  const unsigned long phase = now % 3600UL;
  const float head = -8.0f + (float)phase * 48.0f / 3600.0f;
  display.fillScreen(0);
  for (int x = 0; x < 32; ++x) {
    const float distance = fabsf((float)x-head);
    float envelope = max(0.0f, 1.0f-distance/7.0f);
    envelope = envelope*envelope*(3.0f-2.0f*envelope);
    const int radius = (int)(envelope*4.0f+0.15f);
    // One crisp pixel row at rest; a soft, substantial crest at the pulse.
    for (int dy = -radius; dy <= radius; ++dy) {
      float brightness;
      if (dy == 0) brightness = 0.12f+0.88f*envelope;
      else {
        const float falloff = 1.0f-(float)abs(dy)/(radius+1.0f);
        brightness = envelope*falloff*falloff*0.8f;
      }
      const int red = (int)(brightness*(75.0f+180.0f*envelope));
      const int green = (int)(brightness*(165.0f+90.0f*envelope));
      const int blue = (int)(brightness*255.0f);
      display.drawPixel(x, 15+dy, display.color565(red,green,blue));
    }
  }
}