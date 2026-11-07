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
  struct Spark {
    float x, y;
    float vx, vy;
    int age;
    int maxAge;
  };

  const int SPARK_COUNT = 32;
  static Spark sparks[SPARK_COUNT];
  static unsigned long lastTime = 0;
  static bool initialized = false;

  // Staggered initialization so the fountain streams continuously from the start
  if (!initialized) {
    for (int i = 0; i < SPARK_COUNT; i++) {
      sparks[i].x = 15.5f;
      sparks[i].y = 13.0f;
      float angle = -1.5708f + ((i % 11) - 5) * 0.22f;
      float speed = 0.7f + ((i * 17) % 10) * 0.08f;
      sparks[i].vx = cosf(angle) * speed;
      sparks[i].vy = sinf(angle) * speed;
      sparks[i].maxAge = 800 + ((i * 37) % 650);
      sparks[i].age = (i * 47) % sparks[i].maxAge;
    }
    lastTime = now;
    initialized = true;
  }

  // Delta time clamped to prevent simulation leaps
  unsigned long dtMs = (now >= lastTime) ? (now - lastTime) : 16;
  if (dtMs > 60) dtMs = 60;
  lastTime = now;
  float dt = (float)dtMs / 33.3f;

  display.fillScreen(0);

  // Heartbeat envelope: dynamic double-pump resting rhythm (1150ms cycle)
  unsigned long beatPhase = now % 1150;
  float pulse = 0.0f;
  if (beatPhase < 130) {
    pulse = sinf((beatPhase / 130.0f) * 3.14159f);
  } else if (beatPhase >= 180 && beatPhase < 310) {
    pulse = 0.55f * sinf(((beatPhase - 180) / 130.0f) * 3.14159f);
  }

  // Update and draw cascading light drops
  for (int i = 0; i < SPARK_COUNT; i++) {
    sparks[i].age += (int)dtMs;

    if (sparks[i].age >= sparks[i].maxAge || sparks[i].y > 31.0f || sparks[i].x < 0.0f || sparks[i].x > 31.0f) {
      // Re-emerge overflowing from the cleft and upper lobes
      float side = ((i % 2) == 0) ? -2.2f : 2.2f;
      int offsetX = (int)((now + i * 19) % 7) - 3;
      int offsetY = (int)((now + i * 31) % 5) - 2;
      sparks[i].x = 15.5f + side + offsetX * 0.4f;
      sparks[i].y = 13.0f + offsetY * 0.3f;

      // Arc outward like a spilling fountain
      float spread = (sparks[i].x - 15.5f) * 0.28f;
      float extraPush = 1.0f + pulse * 0.5f;
      int spreadVariation = (int)((i * 43) % 9) - 4;
      sparks[i].vx = (spread + spreadVariation * 0.07f) * extraPush;
      sparks[i].vy = (-0.85f - (float)((i * 29) % 10) * 0.09f) * extraPush;
      sparks[i].maxAge = 800 + (int)((i * 37) % 650);
      sparks[i].age = 0;
    } else {
      sparks[i].x += sparks[i].vx * dt;
      sparks[i].y += sparks[i].vy * dt;
      sparks[i].vy += 0.038f * dt; // Gravity curving sparks downward
    }

    int px = (int)(sparks[i].x + 0.5f);
    int py = (int)(sparks[i].y + 0.5f);

    if (px >= 0 && px < 32 && py >= 0 && py < 32) {
      float lifeProgress = (float)sparks[i].age / (float)sparks[i].maxAge;
      uint16_t dropColor;

      if (lifeProgress < 0.15f) {
        dropColor = display.color565(255, 250, 215); // Pure radiant white-gold
      } else if (lifeProgress < 0.40f) {
        dropColor = display.color565(255, 190, 45);  // Warm sun gold
      } else if (lifeProgress < 0.70f) {
        dropColor = display.color565(245, 60, 110);  // Luminous rose
      } else {
        dropColor = display.color565(140, 15, 50);   // Deep wine ember fade
      }

      display.drawPixel(px, py, dropColor);
    }
  }

  // Heart anchor center
  const int hx = 15;
  const int hy = 16;
  int expand = (pulse > 0.45f) ? 1 : 0;
  int tipY = hy + 8 + expand;

  // Outer aura pulse during systole
  if (pulse > 0.35f) {
    uint16_t aura = display.color565(70, 0, 20);
    display.fillCircle(hx - 3, hy - 2, 4 + expand, aura);
    display.fillCircle(hx + 4, hy - 2, 4 + expand, aura);
    display.fillTriangle(hx - 8, hy, hx + 9, hy, hx, tipY + 2, aura);
  }

  // Solid overflowing heart body (Saturated Crimson)
  uint16_t heartBody = display.color565(230, 8, 55);
  display.fillCircle(hx - 3, hy - 2, 3 + expand, heartBody);
  display.fillCircle(hx + 4, hy - 2, 3 + expand, heartBody);
  display.fillTriangle(hx - 6 - expand, hy, hx + 7 + expand, hy, hx, tipY, heartBody);
  display.fillRect(hx - 5, hy - 3, 11, 4, heartBody);

  // Glowing inner wellspring
  uint8_t coreG = (uint8_t)(40 + 175 * pulse);
  uint8_t coreB = (uint8_t)(70 + 160 * pulse);
  uint16_t innerGlow = display.color565(255, coreG, coreB);

  display.fillCircle(hx - 2, hy - 1, 2, innerGlow);
  display.fillCircle(hx + 3, hy - 1, 2, innerGlow);
  display.fillTriangle(hx - 3, hy, hx + 4, hy, hx, hy + 5, innerGlow);
  display.fillRect(hx - 2, hy - 1, 5, 2, innerGlow);

  // Central white-hot fountainhead
  uint16_t whiteWell = display.color565(255, 250, 220);
  display.drawPixel(hx, hy - 1, whiteWell);
  display.drawPixel(hx + 1, hy - 1, whiteWell);
  display.drawPixel(hx, hy, whiteWell);
  display.drawPixel(hx + 1, hy, whiteWell);

  // Specular gleam on shoulder
  display.drawPixel(hx - 4, hy - 4, display.color565(255, 180, 200));
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