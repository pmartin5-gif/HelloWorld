# Falling Ash — Experiment 03

Small irregular white flakes drift and tumble against black, revealing an invisible local-time clock through accumulation on its outer and interior ledges.

## Accumulation

Airborne flakes retain their continuous wind and falling motion. On contact they enter a 2 CSS-pixel sand grid, with one flake per cell. At each sand tick a grain tries to move down, then diagonally down in a randomized left/right order. Numeral cells are solid. Piles spread until every grain has support; new arrivals can start small avalanches. Grains leaving an unsupported edge finish their interpolated grid movement, then carry its actual horizontal and vertical velocity into the airborne simulation. Resting orientation and width are preserved at release. There is no release-speed reset or extra impulse.

The numerals and grid are never painted. Occupied cells render as the same irregular white flakes, with interpolation between simulation positions. Flakes retain their original sizes when settled. The 2-pixel grid packs them more closely, allowing visual overlap that reduces black gaps between flakes. Each flake has a persistent visual offset of up to 0.6 pixels per axis at the default grid size, carried through flight, settling, and recycling. Physics still uses one grain per cell; visual size and offsets do not change collisions or material volume. There are no column stacks, prescribed pile heights, percentage-based sloughs, or separate friction/momentum rules for sliding.

This adapts the local movement rules in Daniel Shiffman’s [Falling Sand](https://thecodingtrain.com/challenges/180-falling-sand). Destination claims are resolved immediately in one persistent occupancy grid, with each particle updated at most once per sand tick. This prevents grains overwriting one another. Only the particle list is visited during settling; empty cells are not scanned. Typed arrays are rebuilt only for clock or viewport changes.

## Wind, openings, and clock changes

Traveling gusts and eddies retain their previous timing and airflow. Strong wind lifts exposed grains back into the air, retaining a thin basal dust layer on the numerals. There is no wind-driven bulk slide.

A small share of recycled offscreen flakes re-enters beneath inner upper lips, continuously supplying enclosed openings, including both openings of an 8. Occupied entrances pause their supply. The total particle count stays fixed.

When a digit changes, its deposits are released and pass through the clock until they leave and re-enter. Unchanged digits retain deposits, with positions adjusted if the text shifts. Resizing starts a fresh airborne scene at the new size, preserving the particle count. The clock uses the device’s local time in 12-hour format.

Physics runs at 60 fixed steps per simulation second and sand settling at 12 steps. With 2-pixel cells, a diagonal move travels about 34 pixels per second, within the range of the drifting flakes. Rendering interpolates independently of display refresh rate. Reduced-motion preferences slow simulation to 45%; returning from a hidden tab resets the timing to avoid catch-up jumps.

## Preview and settings

Open `index.html` in a browser; no build or dependencies are required. Give the ash time to accumulate. Experiment 04 remains the separate rain sketch.

Edit the settings at the top of `falling-ash.js`:

- `particles`: Total airborne and deposited flakes (8,000).
- `gridCell`: Sand-cell size in CSS pixels (2). Smaller cells make finer deposits and use more grid memory.
- `sandHz`: Settling updates per simulation second (12).
- `physicsHz`: Fixed airborne updates per simulation second (60).
- `interiorSupply`: Share of recycled flakes supplied to openings (`.12`); `0` disables it.
- `gravity`: How quickly airborne flakes return to normal falling speed (32).
- `margin`: Offscreen re-entry padding (26 pixels).
- `windWaitMin/Max`: Quiet interval between events (14–28 seconds).
- `windDurationMin/Max`: Wind duration (6–10 seconds).
- `windStrength`: Gust and eddy multiplier (`.85`); `0` disables events.
- `windErosion`: Exposed-grain erosion rate (`.08`).
- `windResidue`: Retained basal dust depth (3 pixels), rounded up to whole sand cells.

Flake appearance and falling speeds remain in `spawnFlake()` and `inks`.

## Validation

Run from this folder:

```sh
node --check falling-ash.js
node tests/grid.cjs
node tests/edge-handoff.cjs
node tests/wind-grid.cjs
node tests/benchmark.cjs
```

The edge-handoff suite checks gentle diagonal speeds, completion of the final grid movement, continuous release position/velocity/pose, and gradual airborne drag. The grid suite checks competing destination claims, a stable 600-grain mound, natural edge release, interior supply, digit changes, particle conservation, resize, the rendering callback, reduced motion, and identical trajectories at 30/60/120 display frames per second. Wind stress tests run 8,000 particles for two simulation minutes in desktop and portrait viewports and check grid ownership, conservation, solid collisions, interior supply, erosion, and buffer reuse.

`tests/grid-performance.json` records a local physics benchmark against the archived column model at three viewport sizes. It uses a deterministic synthetic hollow raster, 600 warmup steps, and 900 timed steps. The models build different piles; this compares their overall simulation costs rather than identical grain trajectories. It excludes drawing, browser overhead, and mask rebuilds. It is not a browser frame-rate measurement.

These tests use synthetic masks and stubbed Canvas drawing. They do not establish browser typography, visual quality, or mobile hardware performance. The local-file browser preview was blocked by browser policy in this session.

The previous implementation, documentation, and tests are preserved under `tests/legacy/` for comparison. Its old stack/sliding tests target the retired model and are not the current acceptance suite; some had known failures before this replacement.
