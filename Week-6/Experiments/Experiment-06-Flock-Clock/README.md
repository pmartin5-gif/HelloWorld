# Experiment 06 — Flock Clock

An independent variation of `../Experiment-01-Murmuration-Clock/`, copied November 20, 2026. The original experiment is preserved. Experiment 05 became the Week-8 image borkilator, so this continues the sequence at 06.

Open `index.html` in a browser. No installation, server, internet connection, or external libraries are required.

The flock displays local time in 12-hour h:mm format (without AM/PM). The underlying choreography repeats each wall-clock minute:

- 00–08 seconds: gather into the current time.
- 08–10.5 seconds: remain legible while gently fluttering.
- 10.5–17.5 seconds: disperse into currents.
- 17.5–60 seconds: free flight.

Twenty percent of the flock has the ability to defy that choreography and the shared flocking rules. At the default population, exactly 1,600 birds are randomly given this persistent role, spread across both clock and free-flight birds. They periodically abandon alignment, cohesion, shared currents, and numeral destinations to follow personal turning paths at up to 1.75 times the usual speed limit. Each has its own 9–17 second cycle, with smooth departures and returns. Twenty percent are *capable* of defiance; they do not all break away at once. They keep the same appearance as the rest, so their movement reveals the difference.

The remaining 80% follow the original rules. Defiant birds still respond to nearby personal space, viewport edges, and the pointer; neighboring birds can react to them. Clock destinations remain assigned while birds depart, allowing them to rejoin their numeral. Their identities persist across minute changes and resizing; reloading chooses a new group. Editing the population reselects the group, rounded to the nearest whole bird.

The canvas fills the browser viewport, with no visible controls or overlays. Move the pointer to gently part the flock. Reduced-motion preferences slow flight. The canvas automatically follows browser resizes.

The default is 8,000 birds. Thirty-two percent (2,560 by default) have clock destinations; the other 5,440 remain in free flight throughout the formation. Six moving eddies and stronger turbulence keep the surrounding flock active. All birds update each animation frame. A reusable packed spatial grid with bounded, rotating neighbor samples limits crowded-cell work and per-frame allocations. Birds are grouped by ink tone and their triangle directions come directly from normalized velocity; a hidden canvas supplies the numeral mask. Motion uses elapsed time, and phase timing uses the computer clock, rather than counting frames.

Files:

- `index.html`: canvas-only page.
- `style.css`: edge-to-edge white canvas.
- `clock.js`: Canvas implementation of flocking, eddies, text sampling, minute choreography, and individual defiance.
- `tests/simulation.cjs`: dependency-free, seeded headless behavioral checks. Run `node tests/simulation.cjs`. Covers the exact eligible share, persistent identity, refusal and resumption of clock steering, speed allowance, formation stability of obedient birds, and bounded flight through a full minute and resizing. Canvas and font rendering are mocked; these checks do not replace visual browser QA.

Conceptual references: the neighboring nested-loop clock and `Week-5/Flock/let_flock.js`. This experiment uses a fresh implementation. The flocking concepts are separation, alignment, and cohesion; numeral membership supplies an additional time-varying attraction.

## Working copy and publication

Make new changes in this folder. The initial `index.html`, `style.css`, `clock.js`, and simulation checks were byte-for-byte copies of Experiment 01; this variation now changes the animation and its checks. `baseline.sha256.json` records the source file hashes at duplication; `documentation.md` records this starting point and subsequent work.

Public URL: https://pmartin5-gif.github.io/HelloWorld/experiment-06/

The shared `.github/workflows/pages.yml` publishes only `index.html`, `style.css`, and `clock.js` into `/experiment-06/` when changes in this experiment reach `main`. The original Murmuration clock remains at https://pmartin5-gif.github.io/HelloWorld/. Local edits become public only after they are committed, pushed, and successfully deployed.
