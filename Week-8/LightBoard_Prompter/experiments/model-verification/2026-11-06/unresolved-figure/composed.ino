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
  display.fillScreen(0);

  // Animation cycle: 7000ms total loop
  // 0-2500ms: Reaching out into the void
  // 2500-4500ms: Suspended waiting, trembling
  // 4500-6200ms: Recoiling / bracing inward defensively
  // 6200-7000ms: Tense still pause before repeating (unresolved)
  uint32_t t = now % 7000;

  // Distant unreachable pulse in the deep void (cyan glow that never responds)
  // Bounded phase computation prevents floating-point drift over indefinite runtime
  float glowPhase = (float)(now % 4000UL) * (6.2831853f / 4000.0f);
  uint8_t voidGlow = (uint8_t)((sinf(glowPhase) * 0.5f + 0.5f) * 70.0f);
  display.drawPixel(28, 7, display.color565(0, voidGlow / 2, voidGlow));
  display.drawPixel(27, 8, display.color565(0, voidGlow / 3, voidGlow / 2));
  display.drawPixel(29, 6, display.color565(0, voidGlow / 4, voidGlow / 3));

  // Ground plane: faint cold blue baseline
  display.drawFastHLine(2, 30, 28, display.color565(15, 20, 35));

  // Figure kinematics based on state
  float reach = 0.0f;  // 0.0 (curled) to 1.0 (fully extended)
  float brace = 0.0f;  // 0.0 (open) to 1.0 (tight defensive ball)
  int8_t shiverX = 0;
  int8_t shiverY = 0;

  if (t < 2500) {
    // Reaching forward slowly with hesitation
    float p = (float)t / 2500.0f;
    reach = sinf(p * 1.5708f); // Ease out reach
    brace = (1.0f - reach) * 0.3f;
  } else if (t < 4500) {
    // Waiting in maximum extension, slight desperate tremble
    reach = 1.0f;
    brace = 0.0f;
    if ((now / 60) % 3 == 0) shiverX = ((now / 60) % 2 == 0) ? 1 : -1;
    if ((now / 90) % 2 == 0) shiverY = 1;
  } else if (t < 6200) {
    // Recoiling, pulling back and curling tight
    float p = (float)(t - 4500) / 1700.0f;
    reach = 1.0f - sinf(p * 1.5708f);
    brace = sinf(p * 1.5708f);
  } else {
    // Braced tight in silence
    reach = 0.0f;
    brace = 1.0f;
    if ((now / 120) % 4 == 0) shiverY = -1; // Heavy, anxious breath
  }

  // Skeletal anchor positions
  int16_t bx = 8 - (int16_t)(brace * 2); // Body shifts back when braced
  int16_t by = 28 + shiverY;

  // Spine and chest
  int16_t chestX = bx + 2 + (int16_t)(reach * 4.0f) - (int16_t)(brace * 3.0f) + shiverX;
  int16_t chestY = by - 8 + (int16_t)(brace * 3.0f);

  // Head drops low when bracing, raises when reaching
  int16_t headX = chestX + (int16_t)(reach * 2.0f) - (int16_t)(brace * 2.0f);
  int16_t headY = chestY - 4 + (int16_t)(brace * 3.0f);

  // Extended arm reaching into empty space
  int16_t handX, handY;
  if (brace > 0.4f) {
    // Arm wraps around self/head to shield
    handX = chestX - 1;
    handY = headY + 1;
  } else {
    // Arm stretches toward cold pixel
    handX = chestX + 4 + (int16_t)(reach * 11.0f);
    handY = chestY - 1 - (int16_t)(reach * 6.0f);
  }

  // Draw Figure: Warm, fragile amber-white core against dark cold void
  uint16_t skinCore = display.color565(255, 180, 140);
  uint16_t skinDim  = display.color565(180, 80, 50);
  uint16_t skinDark = display.color565(80, 30, 25);

  // Crouched legs / pelvis
  display.drawLine(bx, by, bx + 1, by - 4, skinDark);
  display.drawLine(bx + 1, by - 4, chestX, chestY, skinDim);

  // Torso
  display.drawLine(bx + 2, by - 3, chestX, chestY, skinDim);
  display.drawPixel(chestX, chestY, skinCore);

  // Arm & Reaching hand
  display.drawLine(chestX, chestY - 1, handX, handY, skinDim);
  display.drawPixel(handX, handY, skinCore); // Vulnerable fingertip reaching out

  // Head (fragile dot)
  display.drawPixel(headX, headY, skinCore);
  display.drawPixel(headX - 1, headY, skinDim);
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