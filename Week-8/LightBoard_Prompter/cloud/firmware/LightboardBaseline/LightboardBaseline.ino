// --- CUSTOM PXMATRIX PINS: PRESERVED FROM YOUR SKETCH ---
#define P_R1 13
#define P_G1 27
#define P_B1 26
#define P_R2 13
#define P_G2 27
#define P_B2 26

#define PxMATRIX_DOUBLE_BUFFER true

#include <PxMatrix.h>
#include <math.h>

// ------------------------- Matrix wiring -------------------------
#define P_LAT 22
#define P_A   19
#define P_B   23
#define P_C   18
#define P_D   5
#define P_OE  16

PxMATRIX display(32, 32, P_LAT, P_OE, P_A, P_B, P_C, P_D);

// ------------------------- Display refresh -------------------------
hw_timer_t *displayTimer = nullptr;
portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;

void IRAM_ATTR display_updater() {
  portENTER_CRITICAL_ISR(&timerMux);
  display.display(10);
  portEXIT_CRITICAL_ISR(&timerMux);
}

// ------------------------- Animation timing -------------------------
unsigned long lastFrame = 0;
const unsigned long FRAME_INTERVAL_MS = 33;

// ------------------------- Rest: Everything is on fire -------------------------
void restState(unsigned long now) {
  // Warm moonstones on a low bronze plinth; a ruby crown breathes quietly.
  const float phase = (float)(now % 12000UL) * 6.2831853f / 12000.0f;
  const float drift = sinf((float)(now % 24000UL) * 6.2831853f / 24000.0f);
  const float breath = 0.93f + 0.07f * sinf(phase);
  float shimmer = max(0.0f, sinf((float)(now % 18000UL) * 6.2831853f / 18000.0f));
  shimmer *= shimmer;
  shimmer *= shimmer;
  shimmer *= shimmer;
  static const float cx[3] = {16.0f, 17.1f, 15.2f};
  static const float cy[3] = {6.1f, 14.4f, 23.0f};
  static const float rx[3] = {6.2f, 8.0f, 9.8f};
  static const float ry[3] = {4.2f, 4.3f, 4.6f};
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
          const float edge = min(1.0f, (1.0f - distance) * 2.4f);
          const float lightX = u + 0.20f - drift * 0.07f;
          const float lightY = v + 0.22f;
          const float core = max(0.0f, 1.0f - 0.75f * lightX * lightX - 0.65f * lightY * lightY);
          const float light = (0.58f + 0.42f * edge) * breath;
          if (stone == 0) {
            // Restrained ruby with a warm rose heart, never a white flash.
            const float spotX = u + 0.33f;
            const float spotY = v + 0.30f;
            const float glint = shimmer * max(0.0f, 1.0f - 8.0f * spotX * spotX - 9.0f * spotY * spotY);
            r = (int)((160.0f + 40.0f * core + 14.0f * glint) * light);
            g = (int)((15.0f + 30.0f * core + 18.0f * glint) * light);
            b = (int)((23.0f + 29.0f * core + 12.0f * glint) * light);
          } else {
            const float peach = stone == 1 ? 1.0f : 0.0f;
            r = (int)((205.0f + 45.0f * core) * light);
            g = (int)((91.0f + 116.0f * core - peach * 28.0f + 5.0f * warmth) * light);
            b = (int)((23.0f + 112.0f * core - peach * 28.0f + 7.0f * warmth) * light);
          }
        } else {
          const float halo = (1.48f - distance) / 0.48f;
          const float glow = halo * halo * breath;
          r = (int)((stone == 0 ? 24.0f : 31.0f) * glow);
          g = (int)((stone == 0 ? 2.0f : 12.0f) * glow);
          b = (int)((stone == 0 ? 4.0f : 0.0f) * glow);
        }
        red = max(red, r);
        green = max(green, g);
        blue = max(blue, b);
      }
      if (red > 0) display.drawPixel(x, y, display.color565(red, green, blue));
    }
  }
  // A stable, broad bronze base: lit upper lip and a darker solid body.
  display.drawFastHLine(6, 28, 20, display.color565(88, 48, 18));
  display.drawFastHLine(4, 29, 24, display.color565(63, 31, 10));
  display.drawFastHLine(6, 30, 20, display.color565(43, 20, 7));
}

// ------------------------- Setup -------------------------
void setup() {
  Serial.begin(115200);

  pinMode(P_OE, OUTPUT);
  digitalWrite(P_OE, LOW);

  display.begin(16);
  display.setBrightness(255);
  display.clearDisplay();

  // Preserve your working refresh settings.
  displayTimer = timerBegin(0, 80, true);
  timerAttachInterrupt(displayTimer, &display_updater, true);
  timerAlarmWrite(displayTimer, 1000, true);
  timerAlarmEnable(displayTimer);

  lastFrame = millis();

  Serial.println("Ready: animation");
}

// ------------------------- Main loop -------------------------
void loop() {
  unsigned long now = millis();

  if (now - lastFrame >= FRAME_INTERVAL_MS) {
    lastFrame = now;

    // Draw into the hidden buffer.
    restState(now);

    // Display the completed frame.
    portENTER_CRITICAL(&timerMux);
    display.showBuffer();
    portEXIT_CRITICAL(&timerMux);
  }

  delay(1);
}