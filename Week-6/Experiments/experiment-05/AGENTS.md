# Experiment 05 — Afterimage

Before approaching a request here, read `documentation.md`. Consult the relevant prior intent/execution/fulfillment entries and use the user's feedback to refine the approach. Append meaningful exchanges and actions to that log. Separate completed work, objective checks, and user-confirmed usefulness. Refer to prior entry numbers when they inform a decision.

Established direction:

- This project belongs to a broader practice of computation participating in human expression, including generative art and computational poetry.
- Initial images emphasize ambiguous suggested forms, asymmetric ink pools, dry transfer, and material/paper texture. Rorschach is a reference for interpretation, not mirroring. Do not assume symmetry.
- Source variety must be substantial. Wet wash/dry transfer are materials independent of the source structure; Explore combines structures and Generate uses a fresh seed by default. Keep this seed supports deliberate refinement. Refer to documentation entry 18 for the user's correction of the original narrow variety and restrained ranges.
- Controls should reach pronounced extremes. The user explicitly welcomes loss of cleanliness or composition, including clipping, flooding, breakup, and other unexpected outcomes. Do not limit parameter spans merely to protect a polished composition.
- The interface is an instrument for global conditions and distortion. Do not add drawing tools, brushes, selections, or editing of user-selected image regions.
- Changing a setting prepares a render. Explicit Generate and Apply pass operations produce images. Each distortion pass uses the current image, so effects can accumulate. There is no continuously evolving animation workflow.
- Preserve originals, allow recoverable history/branches, and save/export work deliberately.
- Preserve saved-recipe replay when changing algorithms. The source and each pass record their rendering model; version-1 files retain the original behavior, including when extended with version-2 passes.
- High-resolution output is central: these images are slide-deck backgrounds. Default to 3840 × 2160 PNG, with processing at output resolution and a scaled preview. Do not substitute an enlarged small preview for a full-resolution result.
- Keep this local, buildless HTML/CSS/JavaScript experiment alongside the other Week-6 projects unless the user requests another destination or hosting.

See `README.md` for architecture, controls, run instructions, tests, and known verification limits. The app itself has no external dependencies. `jsdom` is development-only for controller tests; it does not establish browser layout or native Canvas/download behavior.
