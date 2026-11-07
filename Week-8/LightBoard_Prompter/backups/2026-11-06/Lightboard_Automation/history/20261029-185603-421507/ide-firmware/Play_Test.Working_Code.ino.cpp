#include <Arduino.h>
#line 1 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
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

#line 96 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
float smoothProgress(float value);
#line 103 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
void drawGlint(int x, int y, uint16_t color);
#line 112 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
void effect1(unsigned long now);
#line 286 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
void effect2(unsigned long now);
#line 509 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
void restState(unsigned long now);
#line 601 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
void setup();
#line 627 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
void loop();
#line 28 "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino"
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
  // Tactile beach sand: a hand presses in, grains slip, a small wash recedes.
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
  animationTime = (animationTime + step) % 12000UL;

  float press = 0.0f;
  if (animationTime < 2000UL) press = smoothProgress(animationTime / 2000.0f);
  else if (animationTime < 6500UL) press = 1.0f;
  else if (animationTime < 8500UL) press = 1.0f - smoothProgress((animationTime - 6500UL) / 2000.0f);

  uint16_t black = display.color565(0, 0, 0);
  uint16_t sand = display.color565(220, 125, 15);
  uint16_t grain = display.color565(255, 205, 55);
  uint16_t wet = display.color565(150, 65, 0);
  uint16_t skin = display.color565(255, 165, 80);
  uint16_t touch = display.color565(255, 210, 120);
  uint16_t water = display.color565(0, 110, 235);
  uint16_t edge = display.color565(0, 210, 235);

  display.fillScreen(black);

  // A compact patch of sand, with black around it rather than a filled screen.
  for (int y = 7; y <= 29; y++) {
    int inset = y < 10 ? 10 - y : (y > 27 ? y - 27 : 0);
    display.drawFastHLine(2 + inset, y, 28 - 2 * inset, sand);
  }

  // Large, stable flecks make the material read as grains, not visual noise.
  for (int i = 0; i < 24; i++) {
    int x = 4 + ((i * 11 + 3) % 24);
    int y = 9 + ((i * 7 + i / 3) % 18);
    display.drawPixel(x, y, (i % 3) == 0 ? black : grain);
  }

  // Moist sand at the lower edge catches a slow wash of blue water.
  float tide = 0.5f - 0.5f * cosf(6.28318530718f * animationTime / 12000.0f);
  int waterTop = 31 - (int)roundf(3.0f * tide);
  for (int x = 2; x < 30; x++) {
    int scallop = ((x + animationTime / 500UL) % 9) < 3 ? 1 : 0;
    int y = waterTop + scallop;
    display.drawFastVLine(x, y, 32 - y, water);
    display.drawPixel(x, y, edge);
    if (y > 27) display.drawPixel(x, y - 1, wet);
  }

  // A hand-shaped hollow in the sand remains visible around the pressing hand.
  // Five separated fingers and a broad palm are the central silhouette.
  int sink = (int)roundf(2.0f * press);
  const int fingerX[4] = {10, 13, 16, 19};
  const int fingerTop[4] = {10, 7, 6, 9};

  // The dark outline supplies readable gaps between fingers.
  display.fillRoundRect(8, 16, 15, 11, 3, black);
  for (int i = 0; i < 4; i++) {
    display.fillRoundRect(fingerX[i] - 1, fingerTop[i] + sink - 1,
                         4, 15 - fingerTop[i], 1, black);
  }
  display.fillRoundRect(22, 17 + sink, 5, 7, 2, black);

  // Warm, solid shapes, with fingertips slightly buried as pressure increases.
  display.fillRoundRect(10, 17 + sink, 11, 8, 2, skin);
  display.fillRect(12, 24 + sink, 7, 7 - sink, skin);
  for (int i = 0; i < 4; i++) {
    int top = fingerTop[i] + sink;
    display.fillRoundRect(fingerX[i], top, 2, 20 - top, 1, skin);
    display.drawFastHLine(fingerX[i], top, 2, touch);
  }
  display.fillRoundRect(21, 18 + sink, 4, 5, 1, skin);
  display.drawFastVLine(11, 19 + sink, 3, touch);

  // A few distinct grains slide away from the fingers during the press.
  for (int i = 0; i < 5; i++) {
    float progress = ((animationTime + i * 330UL) % 2200UL) / 2200.0f;
    if (press < 0.15f || progress > 0.75f) continue;
    int side = i % 2 == 0 ? -1 : 1;
    int x = (side < 0 ? 7 : 25) + side * (int)roundf(progress * 3.0f);
    int y = 16 + i * 2 + (int)roundf(progress * 3.0f);
    if (y < 28) display.drawPixel(x, y, grain);
  }
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
