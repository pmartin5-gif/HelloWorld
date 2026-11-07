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