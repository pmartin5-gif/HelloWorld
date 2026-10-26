# Murmuration — a clock, briefly

Open `index.html` in a browser. No installation, server, internet connection, or external libraries are required.

The flock displays local time in 12-hour h:mm format (without AM/PM). Each wall-clock minute:

- 00–08 seconds: gather into the current time.
- 08–10.5 seconds: remain legible while gently fluttering.
- 10.5–17.5 seconds: disperse into currents.
- 17.5–60 seconds: free flight.

The canvas fills the browser viewport, with no visible controls or overlays. Move the pointer to gently part the flock. Reduced-motion preferences slow flight. The canvas automatically follows browser resizes.

The default is 8,000 birds. Thirty-two percent (2,560 by default) have clock destinations; the other 5,440 remain in free flight throughout the formation. Six moving eddies and stronger turbulence keep the surrounding flock active. All birds update each animation frame. A reusable packed spatial grid with bounded, rotating neighbor samples limits crowded-cell work and per-frame allocations. Birds are grouped by ink tone and their triangle directions come directly from normalized velocity; a hidden canvas supplies the numeral mask. Motion uses elapsed time, and phase timing uses the computer clock, rather than counting frames.

Files:

- `index.html`: canvas-only page.
- `style.css`: edge-to-edge white canvas.
- `clock.js`: original Canvas implementation of flocking, eddies, text sampling, and minute choreography.
- `tests/simulation.cjs`: dependency-free headless behavioral checks. Run `node tests/simulation.cjs`. Canvas and font rendering are mocked; these checks do not replace visual browser QA.

Conceptual references: the neighboring nested-loop clock and `Week-5/Flock/let_flock.js`. This experiment uses a fresh implementation. The flocking concepts are separation, alignment, and cohesion; numeral membership supplies an additional time-varying attraction.

## Published version

Live clock: https://pmartin5-gif.github.io/HelloWorld/

GitHub Pages serves the root of the `gh-pages` branch. Its root `index.html`, `style.css`, and `clock.js` match this experiment as published on October 24, 2026. Updating local files or pushing `main` does not update the live clock; publish those three files to `gh-pages` to release changes.
