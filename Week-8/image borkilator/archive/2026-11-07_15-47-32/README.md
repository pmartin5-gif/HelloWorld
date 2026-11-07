# Afterimage — Experiment 05

A local instrument for generating asymmetric ink-like images and interrupting them through deliberate, cumulative signal passes. Built for high-resolution slide backgrounds, with ambiguity and suggested form as the visual starting point.

Project location: `Week-8/image borkilator` (moved from `Week-6/Experiments/experiment-05`, then renamed by the user).

## Open

Open **`index.html`** in a modern browser. No installation, account, network connection, or build step is needed. A first wet-wash source renders automatically; subsequent generation and manipulation happen only when you press the relevant button.

Everything is processed locally. The reference photographs and glitch images informed the direction; none are embedded, uploaded, or required to run it.

## Work

1. **Source:** choose Wet wash or Dry transfer as the material. Choose Explore for changing structural combinations, or select a particular structure. Adjust coverage, form scale, bleed, ink load, and paper/pigment texture.
2. **Generate source:** render a new study with a fresh seed by default. Keep this seed holds a composition while you refine its parameters. Typing a seed or using its circular-arrow button holds that chosen seed for the next render. Opening a saved recipe or restoring history also holds its seed. Uncheck Keep this seed to resume exploration. Previous studies remain in the session history.
3. **Signal:** prepare distortions using sliders or numeric percentages. Dragged, Fractured, and Encoded are settings starting points; selecting one does not apply it.
4. **Apply pass:** process the current image. Change settings or apply again to accumulate another pass on the result.
5. **Inspect:** compare Original and Current, switch Fit / 100% to inspect native detail, use Undo / Redo, or select any history thumbnail. A new pass from an earlier state creates another direction and keeps later images in History.
6. **Export PNG:** download the current result at its actual pixel dimensions, without interface elements or text. When comparing Original, export and Apply pass still use the current working result; the comparison message makes this explicit.

There are no brushes, selections, masks to paint, or tools for editing a chosen part of an image. Distortion settings act on the whole image; the process determines where differences emerge.

## Source materials

- **Wet wash:** translucent pigment deposition, variable edge softness, concentrated boundaries, pooling, and paper fibers.
- **Dry transfer:** denser pigment, dragged gaps, and broken coverage from paper and pigment texture.

Material and structure are independent. Both materials can use any of these source structures:

| Structure | Starting imagery |
| --- | --- |
| Pools & blooms | Overlapping, irregular ink masses. |
| Archipelago | Dispersed islands with varied sizes and density. |
| Currents | Elongated, turbulent fields and flowing patches. |
| Filaments | Branching-looking ridges and fine, interrupted networks. |
| Sediment | Distorted layers, bands, and contour-like strata. |
| Ribbons | Curved trails, looping gestures, and broad sweeps. |
| Membranes | Cellular boundaries, voids, and connected chambers. |
| Impressions | Irregular block-like deposits and press fragments. |
| Spatter | Scattered drops and constellations of marks. |

**Explore** chooses and blends two structures from the seed, changing their orientation, placement, dimensions, and interference. Generate changes that seed by default, so successive clicks explore new compositions without requiring a separate reroll. Held seeds and saved settings remain reproducible.

All five source sliders now have deliberately broad spans: coverage reaches sparse traces through flooding; form scale reaches tiny fragments through shapes larger than the frame; bleed reaches hard boundaries through strong turbulence and diffusion; ink load reaches near-invisible pigment through saturated black; and texture reaches smooth material through coarse grain, breakup, and torn-looking coverage. Blank, crowded, clipped, or unruly results at extreme settings are part of the experiment.

The materials are artistic approximations. Broad shapes use a continuous pigment field; full-resolution deposition adds grain, fibers, and dry-transfer breakup. The result is not a physically calibrated fluid simulation. No mirroring is used.

## Signal controls

| Control | Operation |
| --- | --- |
| Vertical pull | Compress column fragments into traces that can stretch to the frame edges. |
| Band shift | Move bands from minor offsets through large, wrapping displacements. |
| Data slip | Offset blocks in the sequence of pixel values, reaching rearrangements across the entire image. |
| Pixel sort | Reorder short segments through complete columns from light to dark. |
| Digital weave | Introduce interrupted checks and bars, up to near-total pattern replacement. |
| Tone crush | Reduce tonal steps and push contrast, reaching a clipped black/white threshold. |
| Signal noise | Add a trace of grain through overpowering, clipped static. |
| Fragment scale | Change bands, columns, and patterns from individual pixels through substantial fractions of the frame. |
| Pass mix | 0 preserves the input; 75 uses the full processed result; 75–100 overdrives the difference, reaching clipping and possible tonal inversion. |
| Pattern seed | Reproduce the placement of a distortion pattern. Choose a new seed for a different placement. |

Effects run in this order: band shift/data slip, vertical pull, pixel sort, digital weave/tone crush/noise, then pass mix. No-op passes do not add history entries. Tone quantization or sorting can eventually stabilize; an already-stable operation need not keep changing on every repetition.

## Resolution and keeping work

- Default: **3840 × 2160 pixels, 16:9**. HD, square, portrait, and custom sizes are available under Output size.
- Generation, every pass, and history snapshots retain the chosen output dimensions. The preview is scaled for display; export does not enlarge a small preview. Change output dimensions before generating a source.
- Custom dimensions: 64–8192 pixels per side, up to 16,777,216 pixels total.
- **Save settings** downloads a JSON recipe containing the current source, dimensions, and all applied passes. **Open settings** replays that recipe and reconstructs its history. Pending, unapplied control changes are not part of the saved image recipe.
- New recipes use version 2, recording the rendering model for the source and each pass. Version-1 recipes still replay using their original source and effect behavior. New effects can be applied to an old study, saved, and replayed with both models preserved.
- Session history exists in the current tab. It retains up to 24 recent states, with an approximate 192 MiB budget for compressed image blobs. Older entries are trimmed when needed; the active state's untouched source remains available for comparison. Undo is available while its parent state remains in History.
- **Export images and save settings before closing or refreshing the tab.** The app has no cloud or automatic disk storage.
- The same recipe is deterministic in the tested engine. Extremely small floating-point differences across JavaScript implementations may affect individual pixels; lossless PNG export preserves the exact result you have.

## Files

`index.html` and `style.css` provide the interface. `app.js` manages the controls, history, comparison, settings replay, and export. `engine.js` generates and manipulates grayscale pixel data. When served over HTTP, `worker.js` runs the engine in a background worker; opening the local HTML file uses a cooperative main-thread fallback. Both use the same engine.

`documentation.md` records intent, execution, fulfillment, and the feedback that guides this experiment. `samples/` retains the first version's 4K studies. `samples/iteration-02/` contains the expanded version's 4K studies, wet/dry variety sheets, and individual previews of all nine structures.

## Validation

The rendering tests have no dependencies:

```sh
node --check engine.js
node --check app.js
node --check worker.js
node tests/engine.cjs
node tests/variety.cjs
```

Generate and verify the 4K sample PNGs:

```sh
node tests/engine.cjs --samples
node tests/variety.cjs --samples
```

Optional controller tests use the development-only `jsdom` dependency:

```sh
npm install
npm run test:workflow
```

The controller harness uses in-memory substitutes for Canvas and browser image encoding. It verifies explicit rendering, cumulative passes, exact history restoration, branching, comparison, export selection, settings replay, dimension changes, worker messages, fresh/held/manual seeds, structure choices, and old/new recipe replay. Rendering tests create real PNGs and check their dimensions. Variety checks compare broad image structure rather than grain alone, exercise control endpoints, and verify the exact version-1 pixel digests captured before this iteration. These tests do not establish browser layout or native Canvas/download behavior.

Browser preview was unavailable during implementation: the execution sandbox blocked a local server, and the browser policy blocked local-file navigation. Generated source, glitch, and variety samples were visually inspected directly. The user subsequently described the first version as a great start and provided the variety/range feedback behind iteration 2. The revised interface remains for user review.

## Influences

The Week-4 looping patterns, aggregation, particle, and fractal experiments provide the broader context of computing as an expressive medium. The user's ink/paper and monochrome glitch references guide this experiment's visual direction. Procedural watercolor research helped inform the overlapping pigment approach:

- [Tyler Hobbs: A Guide to Simulating Watercolor Paint with Generative Art](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art)
- [Curtis et al.: Computer-Generated Watercolor](https://grail.cs.washington.edu/wp-content/uploads/2015/08/curtis-1997-cgw.pdf)

The implementation is original project code; it does not import either reference's source code.
