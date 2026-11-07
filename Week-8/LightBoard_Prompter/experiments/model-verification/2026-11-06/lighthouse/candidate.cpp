void restState(unsigned long now) {
    display.fillScreen(0x0000);

    const float lx = 6.0f;
    const float ly = 9.5f;
    const float period = 3600.0f;
    float phase = (float)(now % (unsigned long)period) * (6.2831853f / period);

    float dx = cosf(phase);
    float dz = sinf(phase);
    float dy = 0.28f + 0.12f * dz;

    float beamAngle = atan2f(dy, dx);
    const float beamHalfWidth = 0.22f;

    float beamFade = 0.0f;
    if (dz > -0.3f) {
        beamFade = (dz + 0.3f) / 1.3f;
        if (beamFade > 1.0f) beamFade = 1.0f;
    }

    float wavePhase = (float)(now % 10000) * 0.0025f;

    // Distant stars
    display.drawPixel(14, 2, display.color565(50, 60, 85));
    display.drawPixel(22, 4, display.color565(50, 60, 85));
    display.drawPixel(28, 2, display.color565(50, 60, 85));
    display.drawPixel(18, 7, display.color565(50, 60, 85));

    // Render sea and volumetric sweep
    for (int y = 0; y < 32; y++) {
        for (int x = 0; x < 32; x++) {
            int cliffW = 8 + (y >= 21 ? (y - 21) / 3 : 0);
            if ((x <= cliffW && y >= 21) || (x >= 4 && x <= 8 && y >= 8 && y <= 21)) {
                continue;
            }

            bool isSea = (y >= 21);
            uint16_t col = 0x0000;
            if (isSea) {
                float wave = sinf((x * 0.45f) + wavePhase + (y * 0.3f));
                bool crest = (wave > 0.45f) && ((y == 23) || (y == 26) || (y == 29));
                col = crest ? display.color565(8, 28, 55) : display.color565(2, 8, 22);
            }

            if (beamFade > 0.02f) {
                float vx = (float)x - lx;
                float vy = (float)y - ly;
                float dist = sqrtf(vx * vx + vy * vy);

                if (dist > 1.2f) {
                    float diff = atan2f(vy, vx) - beamAngle;
                    while (diff < -3.14159265f) diff += 6.2831853f;
                    while (diff >  3.14159265f) diff -= 6.2831853f;
                    diff = fabsf(diff);

                    if (diff < beamHalfWidth) {
                        float edge = 1.0f - (diff / beamHalfWidth);
                        float distFade = 1.0f - (dist / 38.0f);
                        if (distFade < 0.15f) distFade = 0.15f;
                        float str = edge * distFade * beamFade;

                        if (isSea) {
                            float wave = sinf((x * 0.45f) + wavePhase + (y * 0.3f));
                            if (wave > 0.3f) {
                                col = display.color565((uint8_t)(180 * str), (uint8_t)(240 * str), (uint8_t)(255 * str));
                            } else {
                                col = display.color565((uint8_t)(10 + 40 * str), (uint8_t)(35 + 110 * str), (uint8_t)(60 + 130 * str));
                            }
                        } else {
                            col = display.color565((uint8_t)(255 * str), (uint8_t)(230 * str), (uint8_t)(120 * str));
                        }
                    }
                }
            }
            if (col != 0x0000) display.drawPixel(x, y, col);
        }
    }

    // Rocky cliff
    for (int y = 21; y < 32; y++) {
        int w = 8 + (y - 21) / 3;
        display.drawLine(0, y, w - 1, y, display.color565(12, 14, 18));
        display.drawPixel(w, y, display.color565(28, 34, 42));
    }

    // Tower silhouette and stripes
    display.fillRect(5, 19, 3, 3, display.color565(180, 20, 20));
    display.fillRect(5, 16, 3, 3, display.color565(210, 210, 215));
    display.fillRect(5, 13, 3, 3, display.color565(180, 20, 20));
    display.drawLine(4, 12, 8, 12, display.color565(40, 45, 50));
    display.fillRect(5, 9, 3, 3, display.color565(255, 220, 100));
    display.drawPixel(6, 10, display.color565(255, 255, 240));
    display.fillRect(5, 8, 3, 1, display.color565(30, 35, 40));
    display.drawPixel(6, 7, display.color565(20, 25, 30));

    // Flash when beam swings across line of sight
    if (dz > 0.45f && fabsf(dx) < 0.55f) {
        float flare = (dz - 0.45f) / 0.55f;
        uint16_t glow = display.color565((uint8_t)(255 * flare), (uint8_t)(220 * flare), (uint8_t)(100 * flare));
        display.drawPixel(6, 9, glow);
        display.drawPixel(6, 11, glow);
        display.drawPixel(5, 10, glow);
        display.drawPixel(7, 10, glow);
        display.drawPixel(6, 10, display.color565(255, 255, 255));
    }
}