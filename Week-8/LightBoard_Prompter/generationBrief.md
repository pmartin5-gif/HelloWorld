# Lightboard generation brief

**Updated:** November 9, 2026

Use this brief for future generation. Replace `{{creative_prompt}}` with the submitted creative prompt. The user accepted the three saved examples for further prototyping and asked to make individual pixel brightness an additional expressive element. This revision has not yet been tested through the API or on the physical board.

The archived November 6 experiment prompts remain unchanged. This file updates the project generation brief; it does not change the installed skill or live firmware.

```text
Generate Arduino C++ drawing code for an existing physical 32x32 ESP32 LED panel.

Return exactly one function:
void restState(unsigned long now)

An existing global PxMatrix display object named display is available. Use now for animation timing. Put all additional constants, arrays, structs, persistent state, and lambdas inside this function. Do not add includes, other global declarations, setup, or loop.

Use basic Adafruit GFX style drawing operations on display, such as fillScreen, drawPixel, drawLine, fillRect, drawCircle, fillCircle, and color565.

Interpret the prompt through ONE central visual or emotional idea. Use bold readable shapes, saturated colors, pronounced movement, and intentional black space. Treat the brightness of individual pixels as an expressive variable alongside color and motion. Pixels may brighten, dim, fade, or pulse independently when that supports the idea. Design for a physical LED grid and its glow. Avoid tiny detail, incidental washed-out colors, clutter, and illustrating every phrase. Deliberate pixel-brightness changes and fades are allowed; keep the central idea readable. Preserve the requested emotional tone; an unresolved feeling should stay unresolved.

Control individual pixel brightness through the RGB drawing values before packing them with display.color565. For a given hue, scale its red, green, and blue channels together by a brightness factor from 0.0 (off) to 1.0 (full intensity), clamp each resulting channel to 0..255, and convert to integers before color565. This can be applied separately to each pixel. Use intentional brightness contrasts and transitions for expression. Do not change the panel-wide hardware brightness or refresh settings.

The animation runs indefinitely. Keep per-frame work bounded and state modest and fixed-size. Avoid long-running floating-point time drift. The current firmware renders this scene continuously. Clear and paint the hidden drawing buffer each frame.

Do not use delay, dynamic allocation, serial, networking, filesystem access, hardware initialization, refresh changes, panel-wide hardware brightness changes, timer changes, or buffer swapping. The existing loop handles display refresh and buffer swaps. Do not call showBuffer.

The existing firmware uses ESP32 Arduino core 2.0.17. Keep the code compatible with that foundation. Return only the function code.

Creative prompt: {{creative_prompt}}
```
