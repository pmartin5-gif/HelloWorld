# Experiment 04 — Gentle Rain

A local-time clock revealed by fine rain against black. Drops collide with invisible numerals, scatter into fuller fans of beads that lift, fall, and fade. Incoming rain also feeds small delayed drips from the inner upper lips of numeral openings. These fall through the openings and splash on their lower interior surfaces. The numerals have no sheen or drawn outline. Water does not accumulate into piles.

Open `index.html` in a browser. No build or dependencies are required. The clock uses the device’s local time in 12-hour format.

The composition and numeral mask come from Experiment 03. This version replaces its ash, piles, slides, and gusts with rain and ballistic splashes. The collision mask updates with each minute. Resizing rebuilds the scene. Reduced-motion preferences slow the scene.

Adjust the settings at the top of `gentle-rain.js`: `density`, `speedMin/Max`, `lengthMin/Max`, `breeze`, and `splashGravity`. Particle counts adapt to the viewport and are capped at 2,200.

Run `node tests/rain.cjs` for collision, splash lifetime, clock-change, resize, and long-running simulation checks. The test uses a synthetic raster; browser preview is needed to assess the typography and appearance.
