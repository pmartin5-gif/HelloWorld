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

// ------------------------- Buttons -------------------------
const int buttonPin1 = 35;
const int buttonPin2 = 34;

// External pull-ups: released = HIGH, pressed = LOW.
const unsigned long DEBOUNCE_MS = 30;

struct Button {
  int pin;
  byte rawState;
  byte stableState;
  unsigned long changedAt;
};

// Explicit declarations for Arduino's sketch preprocessor.
void initializeButton(Button &button);
bool buttonPressed(Button &button, unsigned long now);

Button greenButton = {buttonPin1, HIGH, HIGH, 0};
Button blueButton = {buttonPin2, HIGH, HIGH, 0};

enum Scene {
  POND,
  HAPPY,
  SAD
};

Scene currentScene = POND;

unsigned long effectStarted = 0;
unsigned long lastFrame = 0;

const unsigned long FRAME_INTERVAL_MS = 33;
const unsigned long EFFECT_DURATION_MS = 3000UL;

// ------------------------- Button functions -------------------------
void initializeButton(Button &button) {
  pinMode(button.pin, INPUT);

  button.rawState = digitalRead(button.pin);
  button.stableState = button.rawState;
  button.changedAt = millis();
}

bool buttonPressed(Button &button, unsigned long now) {
  byte reading = digitalRead(button.pin);

  if (reading != button.rawState) {
    button.rawState = reading;
    button.changedAt = now;
  }

  if (reading != button.stableState &&
      now - button.changedAt >= DEBOUNCE_MS) {
    button.stableState = reading;
    return reading == LOW;
  }

  return false;
}

// ------------------------- Drawing helpers -------------------------
float smoothProgress(float value) {
  if (value < 0.0f) value = 0.0f;
  if (value > 1.0f) value = 1.0f;

  return value * value * (3.0f - 2.0f * value);
}

void drawGlint(int x, int y, uint16_t color) {
  display.drawPixel(x, y, color);
  display.drawPixel(x - 1, y, color);
  display.drawPixel(x + 1, y, color);
  display.drawPixel(x, y - 1, color);
  display.drawPixel(x, y + 1, color);
}

// ------------------------- Effect 1: Happy with golden stars -------------------------
void effect1(unsigned long now) {
  unsigned long elapsed = now - effectStarted;

  uint16_t cyan = display.color565(0, 235, 245);
  display.fillScreen(display.color565(0, 0, 0));

  // Smile is present immediately.
  float expression = smoothProgress(elapsed / 250.0f);
  float smileDepth = 3.0f + 2.0f * expression;

  // Happy rise, then gentle settling.
  float lift = 0.0f;

  if (elapsed < 220UL) {
    lift = 2.0f * smoothProgress(elapsed / 220.0f);
  } else if (elapsed < 800UL) {
    lift = 2.0f *
           (1.0f - smoothProgress(
               (elapsed - 220UL) / 580.0f));
  }

  int offsetY = -(int)roundf(lift);

  // Slow contented blink.
  float eyeOpenness = 1.0f;

  if (elapsed >= 1400UL && elapsed < 1520UL) {
    eyeOpenness = 1.0f -
        smoothProgress((elapsed - 1400UL) / 120.0f);
  } else if (elapsed >= 1520UL && elapsed < 1780UL) {
    eyeOpenness = 0.0f;
  } else if (elapsed >= 1780UL && elapsed < 1940UL) {
    eyeOpenness =
        smoothProgress((elapsed - 1780UL) / 160.0f);
  }

  const int eyeCenters[2] = {9, 22};
  int eyeY = 10 + offsetY;
  int archHeight = (int)roundf(3.0f * eyeOpenness);

  for (int eye = 0; eye < 2; eye++) {
    int ex = eyeCenters[eye];

    if (archHeight == 0) {
      display.fillRect(ex - 3, eyeY, 7, 2, cyan);
    } else {
      for (int thickness = 0; thickness < 2; thickness++) {
        display.drawLine(
            ex - 3, eyeY + thickness,
            ex, eyeY - archHeight + thickness,
            cyan);

        display.drawLine(
            ex, eyeY - archHeight + thickness,
            ex + 3, eyeY + thickness,
            cyan);
      }
    }
  }

  // Continuous, two-pixel-thick smile.
  int previousX = 0;
  int previousY = 0;

  for (int column = 0; column < 22; column++) {
    int x = 5 + column;
    float u = (column - 10.5f) / 10.5f;

    int y = 19 + offsetY +
            (int)roundf(
                smileDepth * (1.0f - u * u));

    for (int thickness = 0; thickness < 2; thickness++) {
      if (column == 0) {
        display.drawPixel(x, y + thickness, cyan);
      } else {
        display.drawLine(
            previousX, previousY + thickness,
            x, y + thickness,
            cyan);
      }
    }

    previousX = x;
    previousY = y;
  }

  // Star sprite:
  // 0 = black space, 1 = amber, 2 = gold, 3 = pale center.
  //
  // Long points and a broad center make the silhouette
  // read as a star rather than an isolated bright dot.
  static const uint8_t star[7][7] = {
    {0, 0, 0, 1, 0, 0, 0},
    {0, 0, 0, 2, 0, 0, 0},
    {0, 0, 1, 2, 1, 0, 0},
    {1, 2, 2, 3, 2, 2, 1},
    {0, 0, 1, 2, 1, 0, 0},
    {0, 0, 0, 2, 0, 0, 0},
    {0, 0, 0, 1, 0, 0, 0}
  };

  // Five safe positions, separated from the face.
  static const uint8_t starX[5] = {3, 28, 3, 28, 16};
  static const uint8_t starY[5] = {3, 28, 28, 3, 3};

  // Twelve appearances, staggered around the face.
  const int STAR_COUNT = 12;

  static const unsigned long starStart[STAR_COUNT] = {
     120UL,  300UL,  480UL,  660UL,
     840UL, 1020UL, 1200UL, 1380UL,
    1560UL, 1740UL, 1920UL, 2100UL
  };

  const unsigned long STAR_DURATION_MS = 420UL;

  for (int i = 0; i < STAR_COUNT; i++) {
    if (elapsed < starStart[i]) {
      continue;
    }

    unsigned long age = elapsed - starStart[i];

    if (age >= STAR_DURATION_MS) {
      continue;
    }

    // Appear as a complete star, hold, then fade.
    // Never shrink into a lone pixel.
    float brightness = 1.0f;

    if (age >= 200UL) {
      brightness = 1.0f -
          smoothProgress((age - 200UL) / 220.0f);
    }

    uint16_t colors[4];
    colors[0] = 0;

    colors[1] = display.color565(
        (uint8_t)roundf(200.0f * brightness),
        (uint8_t)roundf(95.0f * brightness),
        0);

    colors[2] = display.color565(
        (uint8_t)roundf(255.0f * brightness),
        (uint8_t)roundf(190.0f * brightness),
        (uint8_t)roundf(20.0f * brightness));

    colors[3] = display.color565(
        (uint8_t)roundf(255.0f * brightness),
        (uint8_t)roundf(250.0f * brightness),
        (uint8_t)roundf(155.0f * brightness));

    int position = i % 5;
    int left = starX[position] - 3;
    int top = starY[position] - 3;

    for (int sy = 0; sy < 7; sy++) {
      for (int sx = 0; sx < 7; sx++) {
        uint8_t shade = star[sy][sx];

        if (shade != 0) {
          display.drawPixel(
              left + sx, top + sy, colors[shade]);
        }
      }
    }
  }
}


// ------------------------- Effect 2: Sad face with falling petals -------------------------
void effect2(unsigned long now) {
  unsigned long elapsed = now - effectStarted;

  uint16_t cyan = display.color565(0, 235, 245);
  display.fillScreen(display.color565(0, 0, 0));

  float expression = smoothProgress(elapsed / 450.0f);
  float frownDepth = 3.0f + 1.5f * expression;

  // Entire face sits two pixels higher, with a gentle sinking motion.
  int offsetY = -2 + (int)roundf(
      smoothProgress(elapsed / 850.0f));

  // Slow, weary blink.
  float eyeOpenness = 1.0f;

  if (elapsed >= 900UL && elapsed < 1060UL) {
    eyeOpenness = 1.0f -
        smoothProgress((elapsed - 900UL) / 160.0f);
  } else if (elapsed >= 1060UL && elapsed < 1360UL) {
    eyeOpenness = 0.0f;
  } else if (elapsed >= 1360UL && elapsed < 1580UL) {
    eyeOpenness =
        smoothProgress((elapsed - 1360UL) / 220.0f);
  }

  int eyeY = 11 + offsetY;
  int droop = (int)roundf(eyeOpenness);

  // Restrained, two-pixel-thick eyes.
  for (int thickness = 0; thickness < 2; thickness++) {
    display.drawLine(
        6, eyeY + 1 + thickness,
        12, eyeY + 1 - droop + thickness,
        cyan);

    display.drawLine(
        19, eyeY + 1 - droop + thickness,
        25, eyeY + 1 + thickness,
        cyan);
  }

  // Continuous, two-pixel-thick frown.
  int previousX = 0;
  int previousY = 0;

  for (int column = 0; column < 22; column++) {
    int x = 5 + column;
    float u = (column - 10.5f) / 10.5f;

    int y = 24 + offsetY -
            (int)roundf(
                frownDepth * (1.0f - u * u));

    for (int thickness = 0; thickness < 2; thickness++) {
      if (column == 0) {
        display.drawPixel(x, y + thickness, cyan);
      } else {
        display.drawLine(
            previousX, previousY + thickness,
            x, y + thickness,
            cyan);
      }
    }

    previousX = x;
    previousY = y;
  }

  // ------------------------- Tears -------------------------
  static const unsigned long tearStart[2] = {
    1150UL, 1950UL
  };

  const unsigned long TEAR_DURATION_MS = 1100UL;

  for (int i = 0; i < 2; i++) {
    if (elapsed < tearStart[i]) {
      continue;
    }

    unsigned long age = elapsed - tearStart[i];

    if (age >= TEAR_DURATION_MS) {
      continue;
    }

    float progress = age / (float)TEAR_DURATION_MS;
    float fall = progress * progress;

    int outward = (int)roundf(3.0f * progress);
    int x = i == 0 ? 6 - outward : 25 + outward;

    int y = 13 + offsetY +
            (int)roundf(6.0f * fall);

    float brightness = 1.0f;

    if (age < 120UL) {
      brightness = smoothProgress(age / 120.0f);
    } else if (age > 800UL) {
      brightness = 1.0f -
          smoothProgress((age - 800UL) / 300.0f);
    }

    uint16_t tearBlue = display.color565(
        (uint8_t)roundf(40.0f * brightness),
        (uint8_t)roundf(125.0f * brightness),
        (uint8_t)roundf(255.0f * brightness));

    uint16_t tearLight = display.color565(
        (uint8_t)roundf(150.0f * brightness),
        (uint8_t)roundf(225.0f * brightness),
        (uint8_t)roundf(255.0f * brightness));

    display.drawPixel(x, y, tearBlue);
    display.drawPixel(x, y + 1, tearBlue);
    display.drawFastHLine(x - 1, y + 2, 3, tearBlue);
    display.drawPixel(x, y + 3, tearBlue);
    display.drawPixel(x, y + 2, tearLight);
  }

  // ------------------------- Falling petals -------------------------
  // Two hand-shaped poses: a diagonal petal and a turned petal.
  // 0 = empty, 1 = violet shading, 2 = pale lavender.
  static const uint8_t petalSprites[2][5][5] = {
    {
      {0, 0, 0, 0, 0},
      {0, 0, 0, 1, 0},
      {0, 0, 2, 2, 0},
      {0, 1, 2, 0, 0},
      {0, 0, 0, 0, 0}
    },
    {
      {0, 0, 0, 0, 0},
      {0, 0, 1, 0, 0},
      {0, 2, 2, 1, 0},
      {0, 0, 2, 0, 0},
      {0, 0, 0, 0, 0}
    }
  };

  const int PETAL_COUNT = 4;
  const unsigned long PETAL_DURATION_MS = 1900UL;

  static const unsigned long petalStart[PETAL_COUNT] = {
    80UL, 430UL, 900UL, 1350UL
  };

  for (int i = 0; i < PETAL_COUNT; i++) {
    if (elapsed < petalStart[i]) {
      continue;
    }

    unsigned long age = elapsed - petalStart[i];

    if (age >= PETAL_DURATION_MS) {
      continue;
    }

    float progress = age / (float)PETAL_DURATION_MS;

    // Keep petals in narrow outer lanes, away from the face.
    bool leftSide = (i % 2) == 0;

    float sway = sinf(
        progress * 6.2831853f + i * 1.7f);

    int centerX = leftSide
        ? 1 + (int)roundf(0.6f * sway)
        : 30 + (int)roundf(0.6f * sway);

    int centerY = 1 + (int)roundf(29.0f * progress);

    // Turn occasionally instead of flashing between poses.
    int pose = ((age / 380UL) + i) % 2;
    bool mirror = (i % 2) != 0;

    float brightness = 0.85f;

    if (age < 160UL) {
      brightness *= smoothProgress(age / 160.0f);
    } else if (age > 1500UL) {
      brightness *= 1.0f -
          smoothProgress((age - 1500UL) / 400.0f);
    }

    uint16_t petalShade = display.color565(
        (uint8_t)roundf(105.0f * brightness),
        (uint8_t)roundf(65.0f * brightness),
        (uint8_t)roundf(175.0f * brightness));

    uint16_t petalLight = display.color565(
        (uint8_t)roundf(205.0f * brightness),
        (uint8_t)roundf(165.0f * brightness),
        (uint8_t)roundf(245.0f * brightness));

    for (int sy = 0; sy < 5; sy++) {
      for (int sx = 0; sx < 5; sx++) {
        int sourceX = mirror ? 4 - sx : sx;
        uint8_t shade = petalSprites[pose][sy][sourceX];

        if (shade == 0) {
          continue;
        }

        int px = centerX + sx - 2;
        int py = centerY + sy - 2;

        if (px < 0 || px >= 32 || py < 0 || py >= 32) {
          continue;
        }

        display.drawPixel(
            px, py,
            shade == 1 ? petalShade : petalLight);
      }
    }
  }
}


// ------------------------- Rest: Everything is on fire -------------------------
void restState(unsigned long now) {
  // One sunlit tree overlooking the sea: rooted above gently passing waves.
  static bool initialized = false;
  static unsigned long previousTime = 0;
  static unsigned long animationTime = 0;
  unsigned long step = 33UL;
  if (initialized) {
    unsigned long gap = now - previousTime;
    step = gap <= 200UL ? gap : 33UL;
  } else {
    initialized = true;
  }
  previousTime = now;
  animationTime = (animationTime + step) % 24000UL;

  const float TAU = 6.28318530718f;
  float breeze = TAU * (animationTime % 6000UL) / 6000.0f;
  int sway = (int)roundf(sinf(breeze));
  uint16_t black = display.color565(0, 0, 0);
  uint16_t yellow = display.color565(255, 220, 0);
  uint16_t orange = display.color565(255, 110, 0);
  uint16_t green = display.color565(0, 190, 35);
  uint16_t leafLight = display.color565(65, 235, 0);
  uint16_t trunk = display.color565(200, 85, 0);
  uint16_t grass = display.color565(15, 150, 40);
  uint16_t rock = display.color565(85, 30, 150);
  uint16_t sea = display.color565(0, 85, 255);
  uint16_t crest = display.color565(0, 205, 255);

  display.fillScreen(black);

  // Clear sunshine, with black sky giving it room to glow.
  display.fillCircle(26, 6, 4, orange);
  display.fillCircle(26, 6, 3, yellow);
  display.drawFastHLine(24, 4, 3, display.color565(255, 245, 100));
  display.drawFastHLine(19, 6, 2, yellow);
  display.drawFastVLine(26, 0, 1, yellow);
  display.drawFastVLine(26, 12, 2, yellow);
  display.drawPixel(21, 1, yellow);
  display.drawPixel(31, 11, yellow);

  // Ocean below the tree. Two broad bands move at different rhythms.
  int wave = (animationTime / 200UL) % 8;
  int slowWave = (animationTime / 300UL) % 10;
  for (int x = 0; x < 32; x++) {
    int p = (x + wave) % 8;
    if (p < 6) {
      int y = p == 0 || p == 5 ? 25 : 24;
      display.drawPixel(x, y, crest);
      display.drawPixel(x, y + 1, sea);
    }
    int q = (x - slowWave + 20) % 10;
    if (q < 7) {
      int y = q == 0 || q == 6 ? 30 : 29;
      display.drawPixel(x, y, sea);
      if (q >= 2 && q <= 4) display.drawPixel(x, y - 1, crest);
    }
  }

  // A compact cliff makes the elevated viewpoint unmistakable.
  display.fillTriangle(0, 21, 10, 19, 18, 23, rock);
  display.fillTriangle(0, 21, 18, 23, 0, 28, rock);
  display.drawFastHLine(1, 21, 15, grass);
  display.drawFastHLine(3, 20, 9, grass);

  // A substantial trunk, rooted in the headland.
  display.fillRect(7, 12, 3, 9, trunk);
  display.drawLine(8, 16, 4, 12, trunk);
  display.drawLine(9, 15, 14, 11, trunk);
  display.drawLine(9, 16, 14, 12, trunk);

  // One spreading canopy. The trunk stays still as the leaf tips stir.
  display.fillCircle(4 + sway, 9, 4, green);
  display.fillCircle(9, 6, 5, green);
  display.fillCircle(14 + sway, 9, 4, green);
  display.fillRect(4, 8, 11, 5, green);
  display.drawFastHLine(6 + sway, 3, 5, leafLight);
  display.drawFastHLine(2 + sway, 7, 3, leafLight);
  display.drawFastHLine(13 + sway, 7, 3, leafLight);

  // A small black cleft keeps the canopy from becoming a single round blob.
  display.drawFastVLine(9, 12, 2, black);
}

// ------------------------- Setup -------------------------
void setup() {
  Serial.begin(115200);

  pinMode(P_OE, OUTPUT);
  digitalWrite(P_OE, LOW);

  initializeButton(greenButton);
  initializeButton(blueButton);

  display.begin(16);
  display.setBrightness(255);
  display.clearDisplay();

  // Preserve your working refresh settings.
  displayTimer = timerBegin(0, 80, true);
  timerAttachInterrupt(displayTimer, &display_updater, true);
  timerAlarmWrite(displayTimer, 1000, true);
  timerAlarmEnable(displayTimer);

  effectStarted = millis();
  lastFrame = effectStarted;

  Serial.println("Ready: koi pond");
}

// ------------------------- Main loop -------------------------
void loop() {
  unsigned long now = millis();

  bool greenPressed = buttonPressed(greenButton, now);
  bool bluePressed = buttonPressed(blueButton, now);

  // Each press starts or restarts its effect.
  // Simultaneous press events are ignored.
  if (greenPressed && !bluePressed) {
    currentScene = HAPPY;
    effectStarted = now;

    Serial.println("Green: happy for 3.5 seconds");
  } else if (bluePressed && !greenPressed) {
    currentScene = SAD;
    effectStarted = now;

    Serial.println("Blue: sad for 3.5 seconds");
  }

  // Return to the pond when the effect finishes.
  if (currentScene != POND &&
      now - effectStarted >= EFFECT_DURATION_MS) {
    currentScene = POND;

    Serial.println("Rest: koi pond");
  }

  if (now - lastFrame >= FRAME_INTERVAL_MS) {
    lastFrame = now;

    // Draw into the hidden buffer.
    switch (currentScene) {
      case HAPPY:
        effect1(now);
        break;

      case SAD:
        effect2(now);
        break;

      case POND:
      default:
        restState(now);
        break;
    }

    // Display the completed frame.
    portENTER_CRITICAL(&timerMux);
    display.showBuffer();
    portEXIT_CRITICAL(&timerMux);
  }

  delay(1);
}