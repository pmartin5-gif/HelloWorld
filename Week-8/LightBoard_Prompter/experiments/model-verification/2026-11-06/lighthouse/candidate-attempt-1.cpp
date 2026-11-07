void restState(unsigned long now) {
    display.fillScreen(0x0000);

    // Lighthouse coordinates
    const float lx = 6.0f;
    const float ly = 9.5f;

    // Sweep timing: 3.6 second full rotation
    const float period = 3600.0f;
    float phase = (float)(now % (unsigned long)period) * (6.2831853f / period);

    // 3D beam projection: rotates in horizontal plane, angled slightly downward
    float dx = cosf(phase);
    float dz = sinf(phase); // > 0 points toward viewer / front plane
    float dy = 0.28f + 0.12f * dz; // slant downward toward ocean surface

    float beamAngle = atan2f(dy, dx);
    const float beamHalfWidth = 0.22f; // ~25 degree cone

    // Beam is fully visible when facing front; fades smoothly when pointing away
    float beamFade = 0.0f;
    if (dz > -0.3f) {
        beamFade = (dz + 0.3f) / 1.3f;
        if (beamFade > 1.0f) beamFade = 1.0f;
    }

    // Ocean wave animation timing
    float wavePhase = (float)(now % 10000) * 0.0025f;

    // Fixed stars in the clear night sky
    const uint8_t starCount = 5;
    const uint8_t stars[starCount][2] = {
        {13, 2}, {21, 4}, {28, 2}, {17, 7}, {29, 9}
    };
    for (uint8_t i = 0; i < starCount; i++) {
        display.drawPixel(stars[i][0], stars[i][1], display.color565(45, 55, 80));
    }

    // Render sky, sea, and sweeping light beam across the 32x32 grid
    for (int y = 0; y < 32; y++) {
        for (int x = 0; x < 32; x++) {
            // Cliff boundary at bottom left
            int cliffWidth = 8 + (y >= 21 ? (y - 21) / 3 : 0);
            if (x <= cliffWidth && y >= 21) {
                continue; // Painted later with rock texture
            }

            // Tower boundary
            if (x >= 4 && x <= 8 && y >= 8 && y <= 21) {
                continue; // Painted later with lighthouse structure
            }

            bool isSea = (y >= 21);
            uint16_t baseColor = 0x0000;

            if (isSea) {
                // Ocean swells and wave crests
                float wave = sinf((x * 0.45f) + wavePhase + (y * 0.3f));
                bool isCrest = (wave > 0.45f) && ((y == 23) || (y == 26) || (y == 29));
                baseColor = isCrest ? display.color565(8, 28, 55) : display.color565(2, 8, 22);
            }

            // Beam intensity calculation
            uint16_t finalColor = baseColor;
            if (beamFade > 0.02f) {
                float vx = (float)x - lx;
                float vy = (float)y - ly;
                float dist = sqrtf(vx * vx + vy * vy);

                if (dist > 1.2f) {
                    float ang = atan2f(vy, vx);
                    float diff = ang - beamAngle;

                    while (diff < -3.14159265f) diff += 6.2831853f;
                    while (diff >  3.14159265f) diff -= 6.2831853f;
                    diff = fabsf(diff);

                    if (diff < beamHalfWidth) {
                        float edge = 1.0f - (diff / beamHalfWidth);
                        float distFade = 1.0f - (dist / 38.0f);
                        if (distFade < 0.15f) distFade = 0.15f;
                        float strength = edge * distFade * beamFade;

                        if (isSea) {
                            // Beam strikes the dark water, illuminating vibrant cyan-gold crests
                            float wave = sinf((x * 0.45f) + wavePhase + (y * 0.3f));
                            if (wave > 0.3f) {
                                uint8_t r = (uint8_t)(180 * strength);
                                uint8_t g = (uint8_t)(240 * strength);
                                uint8_t b = (uint8_t)(255 * strength);
                                finalColor = display.color565(r, g, b);
                            } else {
                                uint8_t r = (uint8_t)(10 + 40 * strength);
                                uint8_t g = (uint8_t)(35 + 110 * strength);
                                uint8_t b = (uint8_t)(60 + 130 * strength);
                                finalColor = display.color565(r, g, b);
                            }
                        } else {
                            // Beam cutting through the clear midnight air
                            uint8_t r = (uint8_t)(255 * strength);
                            uint8_t g = (uint8_t)(235 * strength * 0.95f);
                            uint8_t b = (uint8_t)(140 * strength * 0.65f);
                            finalColor = display.color565(r, g, b);
                        }
                    }
                }
            }

            if (finalColor != 0x0000) {
                display.drawPixel(x, y, finalColor);
            }
        }
    }

    // --- Coastal Cliff ---
    for (int y = 21; y < 32; y++) {
        int w = 8 + (y - 21) / 3;
        display.drawLine(0, y, w - 1, y, display.color565(12, 14, 18));
        // Rim light on the jagged rock edge
        display.drawPixel(w,