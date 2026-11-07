# borkilator

**Upload an image. Set the distortion. Borkilate. Repeat.**

borkilator is a browser-based instrument for making images strange. It takes an image you supply and treats its pixels as a signal that can be stretched, displaced, sorted, patterned, crushed, or interrupted with noise. Each click of **borkilate** applies a deliberate pass to the current result, allowing small interventions to accumulate into more substantial transformations.

The project explores computation as a participant in human expression. Its inspiration includes glitch art and the creative misuse of audio equipment: distortion can become expressive material rather than an error to eliminate. Controls intentionally reach pronounced extremes, including clipping, breakup, flooding, and loss of recognizable composition.

The current version works with color and transparency, preserves the original for comparison, and provides history, branching, and PNG export. Processing happens locally in your browser; selecting an image does not send it to a server.

## Try it

Open [index.html](index.html) in a modern browser. No account, installation, or build step is needed to use the application.

1. **Upload image:** select a still PNG, JPEG, or WebP. Your image begins as an untouched study.
2. **Prepare Signal settings:** move sliders, enter percentages, or try the Dragged, Fractured, and Encoded presets. Changing settings does not render an effect. Clear resets the prepared effects; it does not undo an image.
3. **Borkilate:** apply the prepared effects. Adjust and repeat, or apply the same settings again to build on the result.
4. **Compare and explore:** switch between Original and Current, inspect at Fit or 100%, and use Undo / Redo. Select an earlier History state and borkilate from there to create a different direction while retaining later results.
5. **Keep your work:** Export PNG saves the current result. Save settings preserves the starting image and applied passes in a file that Open settings can reconstruct later.

Uploading another image starts a new study and retains both earlier session history and the prepared Signal settings. Those settings affect the new image only after you click borkilate. While viewing Original, borkilate and Export PNG still operate on the current working result.

The interaction is based on whole-image conditions and successive passes. There are no brushes, selections, or tools for editing a chosen region.

## What the Signal controls do

| Control | Visible effect |
| --- | --- |
| Vertical pull | Stretches column fragments into vertical traces and smears. |
| Band shift | Moves horizontal bands sideways, wrapping displaced content. |
| Data slip | Rearranges blocks through the image's sequence of pixels. |
| Pixel sort | Orders column segments from light to dark, carrying each pixel's color and transparency together. |
| Digital weave | Introduces interrupted checks, bars, and digital patterns. |
| Tone crush | Reduces tonal steps and increases contrast toward clipping. |
| Signal noise | Adds seeded brightness noise, from slight grain to overpowering static. |
| Fragment scale | Changes the size of fragments and patterns, from individual pixels to large areas. |
| Pattern seed | Controls repeatable placement of the distortion pattern. |
| Pass mix | Blends the input and processed result: 0 preserves input, 75 uses the full effect, and higher values overdrive the difference. |

Combined effects run in a fixed order: band shift/data slip, vertical pull, pixel sort, weave/crush/noise, then pass mix. Spatial effects move complete color-and-alpha pixels; tonal effects preserve transparency. A useful way to learn is to try one effect at a time, then use Undo to compare different strengths from the same starting image.

## Images, saving, and practical limits

- **Image files:** still PNG, JPEG, and WebP, up to 100 MiB. Animated images are rejected.
- **Dimensions:** native size and aspect ratio are retained, with no automatic enlargement or cropping. Above 8192 pixels per side or 16,777,216 pixels total, the application offers proportional reduction or cancellation. Your file on disk is unchanged.
- **Export:** PNG at the working image's actual dimensions, including transparency. The preview checkerboard and interface are excluded. Slide-background use motivated high-resolution processing, but an uploaded image is not automatically converted to 4K.
- **Saved work:** self-contained version-3 JSON includes a normalized PNG of the starting image, its filename, dimensions, and applied passes. It reopens without the original external file. Pending control changes are not included. The saved-file limit is 128 MiB.
- **Session history:** up to 24 states within an approximate 192 MiB compressed-image budget, with up to 64 passes per study. Older states may be trimmed. The active study's original remains available for comparison.

**Save or export before refreshing or closing the tab.** Session history is not automatic disk or cloud storage. Large images also need uncompressed working memory, so practical capacity depends on the device. Invalid imports, cancelled resizing, and processing or replay failures are handled without replacing the current study.

## Assignment background and iterations

The project began with a practical problem: finding suitable background images for a PComp presentation. Image searches and stock libraries often produced unsuitable dimensions, insufficient resolution, or watermarked results. Making images became an alternative, and then an opportunity to experiment with deliberately disrupting them.

Originally developed as `Week-6/Experiments/experiment-05`, the project was called **Afterimage**. Early versions generated asymmetric monochrome wet-wash and dry-transfer imagery, emphasizing ambiguity, suggested form, ink, and paper texture. Rorschach imagery informed interpretation rather than a requirement for symmetry. Signal controls then introduced cumulative digital distortions.

The next iteration expanded generation to nine source structures, introduced fresh compositions on successive generations, and widened parameter ranges after feedback that the imagery was too repetitive and the effects too restrained. The project subsequently moved into Week-8 as a candidate for the assignment to revise a project or build a useful tool, accompanied by a compact process record.

For the Week-8 revision, the procedural version was archived and the Source workflow was replaced by image upload. Signal processing was extended to color and transparency while preserving deliberate passes, history, comparison, and export. The current name is **borkilator**, and the action button is **borkilate**. Broader visual branding remains future work.

The process combines human direction, reference selection, evaluation, and decisions with AI-assisted planning, implementation, testing, and documentation through Codex. The supporting records distinguish requested intent, actions taken, automated evidence, and user feedback rather than treating those as interchangeable.

## Background files and process records

- **[documentation.md](documentation.md):** the ongoing project conversation log, organized by intention, execution, and fulfillment. It records the conceptual direction, corrections, implementation decisions, validation limits, and the move from procedural generation to uploads. Entries 7–16 establish the original workflow; 17–19 cover early implementations and feedback; 21–25 cover relocation, archiving, uploads, and naming.
- **[Homework Notes.zip](Homework%20Notes.zip):** an exported Week-8 assignment record containing a Markdown document and supporting screenshots. It includes assignment links, personal background, the audio-distortion analogy, prompts and planning choices, before/after imagery, observations from using the upload version, and proposed next steps. Some links inside the export retain the earlier `image borker` folder name; use this README's local links for the current files.
- **[Starting-place overview video](borker%20starting%20place%20overview.mov):** a walkthrough of the earlier procedural version, referenced in the homework notes as the starting point for the revision. It documents that version rather than the current upload interface.
- **[Archived application](archive/2026-11-07_15-47-32/index.html):** the preserved procedural version before the upload changes. Its [README](archive/2026-11-07_15-47-32/README.md) explains the earlier workflow, and a [SHA-256 manifest](archive/2026-11-07_15-47-32.manifest.json) records the backup's file hashes. Use this version to open old version-1/2 procedural settings files.
- **[Sample images](samples/) and [iteration-02 notes](samples/iteration-02/README.md):** historical output from the procedural iterations, including 4K studies, source-variety comparisons, and parameter-extreme examples.
- **[AGENTS.md](AGENTS.md):** working guidance for future coding assistance, including the established interaction constraints and responsibility to maintain the process log.

The homework notes propose further work: making the empty image area clickable for upload, adding a “cosmic particle” effect, introducing an overall “borkilation” slider, and simplifying interface details. These are ideas for subsequent iterations, not current features. The naming change described there has been completed.

## Development and verification

The application is buildless HTML/CSS/JavaScript. [app.js](app.js) manages upload, controls, history, save/reopen, and export; [engine.js](engine.js) performs pixel processing. When served over HTTP, [worker.js](worker.js) runs Signal processing in the background. Opening the local HTML uses a cooperative main-thread fallback with the same engine. Earlier procedural engine functions remain for regression comparison.

Node.js is needed only for development checks. The optional controller harness uses the development-only `jsdom` dependency.

```sh
npm install
npm test
npm run test:legacy-engine
node --check app.js
node --check engine.js
node --check worker.js
```

The checks cover RGBA effects, grayscale compatibility, deterministic processing, preservation of input, worker agreement, upload and save/reopen workflows, history and branching, size limits, cancellation, and failure recovery. A full-resolution 3840 × 2160 RGBA pass has also been checked.

Controller tests use simulated Canvas/PNG APIs. Automated checks do not establish native browser decoding, orientation, resizing quality, layout, PNG encoding, or download behavior. Live browser QA during implementation was blocked by the environment's restriction on starting a local preview server. The homework notes separately record the user's successful upload/distortion example and usability observations; they do not establish comprehensive browser coverage.
