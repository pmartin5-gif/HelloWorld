# Passing Time

Open `index.html` directly in your browser. No installation, server, dependencies, or internet connection is required. This is a separate local experiment; the first clock and its published site are unchanged.

8,000 slightly larger charcoal triangles fly diagonally overhead, from lower left to upper right. The viewpoint stays fixed. Birds leave the frame and re-enter along upstream edges, with entry rates weighted by the flow crossing each edge.

The local 12-hour time is always subtly present. An invisible, softly feathered numeral mask makes selected birds slow by up to 85%. The `affectedPercentage` setting defaults to 65: each bird has a 65% chance of responding, chosen at startup and again whenever it re-enters the scene. Set it from 0 (no birds respond) to 100 (all birds respond), then save and reload. Unselected birds pass through without the clock's slowing or bend. The optional `bend` setting currently defaults to 0. They return smoothly to ordinary flight after crossing it. No birds have numeral destinations, and none change color in response to the time. Slower passage creates a modest increase in density inside the digits. Individual sizes, tones, and speeds vary; broad traveling ripples and local heading alignment create loose groups while birds follow the configured flight direction.

Each minute, old and new masks blend over 5 seconds. The lettering is centered and scales with the viewport. Reduced-motion preferences slow the whole flock. There are no visible controls or overlays.

Creative tuning lives in the `settings` object in `passing-time.js`: population, affected percentage, heading, slowing, bend, and response time. `heading` sets the overall flight direction in degrees: use `0` for right, `90` for down, `180` for left, or `270` (also `-90`) for up. Any number is supported and wraps every 360 degrees. `bend` still sets the extra turn inside the numerals in radians. Recycling supplies birds along upstream edges for the base heading and catches exits on all four sides, including exits caused by a large bend. Turns and local alignment wrap smoothly around a full circle. Large bends can create loops or change numeral density as birds turn within the mask.

The density and readability are deliberately subtle and should be evaluated in motion.

Performance: four batched triangle paths, cached mask pixels with interpolated lookup, reusable typed arrays for local alignment, and no pairwise neighbor searches or per-bird destination assignment.

Run `node tests/simulation.cjs` for behavioral checks. These use a synthetic mask and mocked drawing calls; they do not verify actual browser font rendering or visual legibility.
