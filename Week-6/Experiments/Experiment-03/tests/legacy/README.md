# Falling Ash — Experiment 03

A variation on Experiment 02, Passing Time. Small, irregular white flakes fall against a black background from above, drift in gentle air currents, and tumble independently. The local-time clock is invisible and solid: ash rests on the upper contours of its numerals and on ledges inside their holes. A small share of offscreen recycled flakes re-enters just below the inner upper lips, keeping enclosed openings supplied after their initial ash settles. Both openings of an 8 receive ash. Full openings pause their supply until the pile clears; particle count stays fixed.

Deposited flakes form connected mounds. When a part of the mound is too steep, top grains begin a continuous slide. Their positions follow an interpolated surface, with downhill acceleration and kinetic friction. They carry momentum across the accumulation grid and come to rest when the slope levels out. The stable slope is approximately 37 degrees, with a small allowance for the size and cohesion of the flakes.

Ash builds to about 42 CSS pixels at an exposed edge before sloughing. A failure releases only the top 18% of that edge's stack, leaving the base in place. It does not remove a patch from the middle or send a clump across the numeral. Material farther up the slope can then slide down to replenish the edge, producing a progressive avalanche. A flake clearing the lip keeps its velocity and falls away without repeatedly catching on lower ledges of the same digit. The numerals themselves are never painted.

Gusts and eddies arrive from beyond a side of the canvas, travel across the full viewport, and leave beyond the opposite edge. Successive events usually follow the same larger airflow, while eddies add modest shear and deflection within the prevailing flow. Their paths meander slightly, their shapes shear, and their strength varies smoothly during the crossing. Each event has a varied height, size, strength, circulation, and duration (6–10 simulation seconds), with a quiet interval of 14–28 seconds afterward. The first event arrives after 8–16 seconds. Wind intensity is `.85`, half the earlier `1.7` setting. Wind eases in and out at the ends of its offscreen-to-offscreen passage and fades toward its spatial boundary. Ordinary eddies mainly bend the fall; sufficiently strong updrafts can lift flakes. Vertical wind changes the air-relative settling speed, and numeral undersides still block upward motion. When strong local wind reaches a pile, it progressively strips exposed top grains into the airflow. Stronger currents remove ash faster, while retaining about 3 pixels of settled dust so a gust does not scrub the numerals completely bare. Weak breezes and piles outside the affected area stay undisturbed. Wind also lifts ash already sliding down a slope. Detached flakes clear their source digit before returning to the general fall. Piles continue to build and slough between events.

When a digit changes, all ash deposited on that digit drops away, including ash on edges shared by the old and new shapes. Released ash passes through all clock surfaces until it leaves the scene and re-enters from the top. New ash begins accumulating on the changed digit immediately. Unchanged digits retain their piles. A resize rebuilds the collision surfaces for the new canvas size.

Open `index.html` in a browser. The scene begins with airborne flakes across the open space. Flakes crossing a side wrap to the opposite edge at the same height with their momentum intact. Fresh incoming flakes are supplied from above and, during wind, through the upwind edge in proportion to the airflow. This prevents a gust from draining sections of the sky. Give it time to accumulate. Reduced-motion preferences slow the simulation.

Edit the `settings` block in `falling-ash.js` and reload:

- `particles`: Total number of flakes, including deposited ash.
- `interiorSupply`: Share of recycled flakes fed into numeral openings (default `.12`); `0` disables this supply.
- `pileDepth`: Depth at an exposed edge before sloughing (42 CSS pixels by default).
- `reposeSlope`: Stable mound rise/run; `.75` is approximately 37 degrees.
- `sloughFraction`: Fraction of the top of an overloaded edge released per slough (18% by default).
- `gravity`: How quickly released ash accelerates toward its normal falling speed.
- `surfaceCell`: Width of each accumulation column in CSS pixels.
- `margin`: Offscreen distance before flakes re-enter at the top.
- `windWaitMin` / `windWaitMax`: Quiet seconds between wind events.
- `windDurationMin` / `windDurationMax`: Event duration in simulation seconds.
- `windStrength`: Overall wind intensity multiplier (default `.85`); `0` disables events.
- `windErosion`: How quickly strong local wind strips exposed ash (default `.08`).
- `windResidue`: Minimum layer retained by wind erosion (default `3` CSS pixels). Clock changes still release all ash on a changed digit.

Flake speed, size, outline, and tones are defined in `spawnFlake()` and `inks`.

Run `node tests/simulation.cjs` from this folder to check collisions, buildup, continuous sliding across multiple columns without pauses or position jumps, stable mound slopes, shallow-pile retention, top-layer edge failures, numeral holes, clock changes, resizing, particle conservation, intermittent wind, updraft collisions, and localized wind erosion of piles. These checks use synthetic masks; they do not verify browser painting or artistic legibility.

## Wind-motion references

This is an artistic approximation of moving near-ground turbulence, rather than a location-specific weather simulation. The [National Weather Service general-winds guide](https://www.weather.gov/media/zhu/ZHU_Training_Page/winds/FireWx_General_Winds/FireWx_General_Winds.pdf) describes local terrain and obstacles shaping eddies, with detached eddies moving downstream. The [FAA discussion of obstructions and wind flow](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC%2000-6A%20Chap%207-9.pdf) describes turbulent eddies carried by the ambient wind. These inform the traveling, deforming packets used here.

## Three-round piling audit

Run `node tests/piling-rounds.cjs` for all three rounds, or append `1`, `2`, or `3` to run one round. The harness executes the production physics with deterministic seeds and controlled raster surfaces. Clock time is held fixed to isolate pile behavior.

1. **Gentle accumulation and side contacts.** A 40-second gentle-rain test builds a shallow mound without premature sloughing. Fixed side collisions that previously snapped a grain 31 pixels up to the crest. After the fix, the side-contact displacement is about 0.06 pixels and the largest gentle landing adjustment is 0.81 pixels.
2. **Excessive buildup and continuous runout.** An exposed edge first releases at 42.53 pixels, preserving the base and shedding only the upper layer. Fixed uphill collisions that previously snapped a slider 47 pixels onto the neighboring mound. It now stops at the foot of that mound, with a 0.03-pixel adjustment in the regression scenario.
3. **Repeated buildup and release.** Fixed an overloaded lip being routed inward instead of shedding outward. Six two-minute runs cover flat and curved shelves without wind, plus hollow shapes with wind, using two seeds each. All runs retain particle counts and stack ownership and keep landing adjustments below 2 pixels. Calm runs continue shedding after the first minute; windy runs verify stripping of exposed ash, which can prevent a pile reaching the sloughing threshold.

The general simulation suite tests calm pile buildup separately from wind erosion, since a gust can remove ash before an edge reaches its sloughing threshold. These are physics regression tests with controlled shapes; they do not replace visual review of browser-rendered clock numerals.

## Three-round wind audit

These results record the earlier audit at wind strength `1.7`; the current `.85` strength and longer quiet intervals are a subsequent tuning change.

The qualitative benchmark is a prevailing, predominantly horizontal airflow containing correlated gusts, lulls, and downstream-moving disturbances. References:

- [NWCG, General Winds](https://www.nwcg.gov/publications/pms425-1/6-general-winds): surface gustiness and eddies moving with the general airflow.
- [NOAA, Origin of Wind](https://www.noaa.gov/jetstream/synoptic/origin-of-wind): horizontal wind generally dominates vertical motion.
- [TurbSim user guide](https://www.nlr.gov/docs/libraries/wind-docs/turbsim_v2-00-pdf.pdf): mean wind and spatial coherence provide a conceptual reference for a shared flow with correlated disturbances. This scene does not implement TurbSim's spectral model.

The numeric targets are design acceptance criteria for this viewport, not measured atmospheric constants. There is no mapping from pixels to real-world meters, no terrain-resolved airflow solution, and no meteorological calibration.

1. **Coverage.** Test 24 events at their midpoint in each of three viewports: 1200×700, 390×844, and 1920×800. An active sample has at least 10 CSS pixels/second of event wind. Target: median coverage at least 65%, minimum at least 50%. The original small events covered a median 12–17%; viewport-scaled fronts now cover a median 99.5%, with a minimum 96.4% in these tests. This measures the strongest part of the passage; entry, exit, and quiet intervals remain gentler.
2. **Coherent transport.** Simply enlarging the old vortex left about 13% of active samples flowing against the prevailing direction, with vertical RMS motion 67% of horizontal RMS. Replacing dominant rotation with a broad mean flow and modest eddy perturbations gives 100% downwind samples and an 8.6% vertical/horizontal RMS ratio. Targets: at least 95% downwind, at most 35% vertical/horizontal RMS, and nearby direction cosine at least .98. A separate 400-particle cloud test finds every flake gains at least 30 pixels of downwind displacement over its calm counterpart after 1.5 seconds; median extra drift is 81.6 pixels.
3. **Efficiency.** Cache event-wide coefficients once per simulation frame, share drag responses across particles, and avoid allocating filtered collision arrays for each grain. The field test reduces roughly 400,000 trigonometric evaluations per 80,000 samples to five; drag exponentials are two per frame for 8,000 particles. A three-repeat benchmark against the broadened but unoptimized model records median physics steps of 1.96 ms before and 1.32 ms after; p95 is 2.20 ms before and 2.06 ms after. Median time for 200,000 field samples falls from 14.48 ms to 3.67 ms. See `tests/wind-performance.json` for the measured machine and details.

Run `node tests/wind-rounds.cjs` for the three rounds, or append `1`, `2`, or `3`. Run `node tests/wind-benchmark.cjs` for current timings; optionally pass a source snapshot path to compare versions. Timings include production physics in Node and exclude browser Canvas painting, so they are not browser frame-rate measurements. The pile and general simulation suites remain separate regression checks. Visual feel still requires review of the animation.

Run `node tests/wind-density.cjs` to verify height-preserving side wrapping, retained dust on numerals, and sustained-wind coverage across 18 screen regions in both wind directions. The density test uses an empty sky to isolate wind transport from ash collecting on clock surfaces.

Run `node tests/interior-supply.cjs` to verify sustained inner-ledge accumulation, two openings, full-gap backpressure, changed-digit release, and fixed particle counts.
