# Experiment 05 — borkilator

Before approaching a request here, read `documentation.md`. Consult the relevant prior intent/execution/fulfillment entries and use the user's feedback to refine the approach. Append meaningful exchanges and actions to that log. Separate completed work, objective checks, and user-confirmed usefulness. Refer to prior entry numbers when they inform a decision.

Established direction:

- This project belongs to a broader practice of computation participating in human expression, including generative art and computational poetry.
- Start studies by uploading still PNG, JPEG, or WebP images. Preserve color, transparency, native dimensions, and aspect ratio. Procedural Source generation is retired from the active workflow; its earlier implementation is preserved in the archive.
- Controls should reach pronounced extremes. The user explicitly welcomes loss of cleanliness or composition, including clipping, flooding, breakup, and other unexpected outcomes. Do not limit parameter spans merely to protect a polished composition.
- The interface is an instrument for global conditions and distortion. Do not add drawing tools, brushes, selections, or editing of user-selected image regions.
- Changing a setting prepares a render. Uploading starts an untouched study. Explicit borkilate operations produce manipulated images. Each distortion pass uses the current image, so effects can accumulate. There is no continuously evolving animation workflow.
- Preserve originals, allow recoverable history/branches, and save/export work deliberately.
- Self-contained version-3 saves embed the normalized starting PNG and applied Signal passes. Reject version-1/2 procedural saves with directions to the archive. Preserve version-3 replay when changing algorithms.
- Process and export at uploaded dimensions with a scaled preview. Never upscale silently. Offer proportional reduction above 8192 pixels per side or 16,777,216 total pixels, with explicit confirmation. Keep transparency in PNG exports.
- Keep this local, buildless HTML/CSS/JavaScript experiment in `Week-8/image borkilator`, the folder renamed by the user, unless they request another destination or hosting.

See `README.md` for architecture, controls, run instructions, tests, and known verification limits. The app itself has no external dependencies. `jsdom` is development-only for controller tests; it does not establish browser layout or native Canvas/download behavior.
