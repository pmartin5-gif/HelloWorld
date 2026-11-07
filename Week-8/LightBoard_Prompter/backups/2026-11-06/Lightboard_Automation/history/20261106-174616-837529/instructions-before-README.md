# Prompt-to-LED workflow

A user message ending in **`%%%`** (ignoring trailing whitespace) requests automatic generation and deployment of a resting animation. Interpret the preceding text as the creative prompt. A standalone marker refers to the most recently discussed design. Discussion or quoted examples of the marker do not trigger deployment. Without the suffix, discuss/design without changing the panel. Later explicit user instructions may override this convention.

This is a chat-operated workflow: an active Codex session performs the generation and Arduino IDE interaction. It is not a background watcher or separate model API application.

Working sketch: `/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino`. Read that folder's `AGENTS.md` when starting a new conversation. Keep the installed ESP32 core 2.0.17, board profile, libraries, wiring, both face effects, 3000 ms timing, and double buffering unchanged.

## Short routine path

1. Interpret ONE strong visual idea and announce it briefly. Generate exactly `void restState(unsigned long now)`; put any supporting state and lambdas inside it. Save code and the user's exact prompt under `incoming/`.
2. For a scene that benefits from visual inspection, run the reusable preview once, before deployment. Inspect one contact sheet for recognition, black-space separation, and major overlap/clipping issues. Skip it for a straightforward revision or already-previewed source. Do not build a new preview framework or make discretionary polish passes during each prompt.
3. Run `deploy`. It checks the function boundary, basic runtime restrictions, exact protected bytes, current source checkpoint, and USB identity; archives before/after source; then prepares the working sketch. **In the current IDE backend it does not compile.** Its response supplies the port and pending history path.
4. Verify the correct sketch/board/port in Arduino IDE and that the disk candidate is loaded without conflicting unsaved edits. Reuse the current app handle and known project. Use at most one focused search if the new function is not visible. Clear old Output and click **Upload once**. IDE handles the one firmware compilation and flash, using its existing stable build cache.
5. Observe fresh output until flash verification/reset success, save the observed output into the pending history directory, then run `complete-ide`. Report delivery briefly. No standalone CLI compile or second Verify click.

Routine creative updates do not require repeating setup tests, package discovery, documentation searches, or full sketch inspection. The helper reads and protects the actual current source. Run a separate `status` when the user reports reconnection or when troubleshooting; `deploy` already discovers the USB adapter itself.

```sh
python3 preview.py --code incoming/scene.cpp --output cache/preview.png
python3 lightboard.py deploy --code incoming/scene.cpp --prompt-file incoming/prompt.txt --description 'Brief visual interpretation'
python3 lightboard.py complete-ide --log-file /absolute/pending/history/observed-ide-upload.txt
python3 lightboard.py restore
python3 lightboard.py status
```

`restore` prepares the previous animation and requires the same IDE completion steps. An unchanged test upload does not replace the previous-animation pointer.

## One compilation, reused build files

Direct serial read/write is blocked in this execution environment; Arduino IDE's native Upload control works. `config.json` selects `arduino-ide` and records the existing IDE build-cache directory. The sketch remains at its original path so IDE can reuse unchanged library/core objects. Do not clear caches, change board settings, or run a second compiler as part of a normal update.

After the verified upload, `complete-ide` archives the IDE-built `.bin` files, build options, and generated C++ without recompiling. It checks the cache's sketch/board identity, exact restState match, and uploaded byte count before recording delivery. If the cache path changes, locate the matching `build.options.json` by its `sketchLocation` and board profile; don't guess or declare success with stale firmware. The same applies to conflicting unsaved IDE buffers.

The optional CLI backend also uses stable `cache/cli-sketch` and `cache/cli-build` paths and exports immutable firmware snapshots into history. It remains for environments where direct serial access is available. Do not use a terminal UI to evade this environment's serial restriction.

## Reusable preview

`preview.py` uses the checked-in `preview_gfx.h` mock, clang++, and Python's standard library. No Pillow, package installs, or handwritten renderer per request. It compiles a small desktop renderer for new code (not ESP32 firmware), caches it by source/header/sample-time hash, simulates approximately 30 FPS, and produces one nearest-neighbor PNG contact sheet. Default samples: 100, 1000, 3000, and 6000 ms. Override with `--times-ms` if another point in the animation matters.

The preview is optional and limited: it is not ESP32 execution, exact Adafruit rasterization, PxMatrix scanning, LED glow, or a video of the physical board. Unsupported drawing APIs or a preview timeout should not launch a renderer-development detour. Inspect the code instead and let the real Arduino compiler validate it. Fix a clear readability defect before deployment; leave discretionary refinements to user feedback.

Measured during the optimization: first lighthouse preview 0.783 s; cached preview 0.027 s. These are local measurements, not guarantees for arbitrary scenes.

## Failure handling and recovery

- Structural/protected-code/USB failure: stop before changing the working sketch.
- In IDE mode source is prepared before the single compilation. If compilation fails, IDE does not flash it; run `abort-ide` to restore the prior source. Correct at most two generated-code errors and retry within restState only. Never change protected code or dependencies to fix a generated scene.
- Upload failure: `abort-ide` restores source. If flashing started, upload the restored source through IDE once, then report whether recovery succeeded. The prior firmware snapshot remains archived.
- `complete-ide` requires freshly observed `Hash of data verified` and `Hard resetting via RTS pin` output, current disk bytes matching the candidate, and matching IDE artifacts. Until completion/abort, the pending job blocks new deployments.
- Arduino IDE may hold a stale in-memory version. Do not blindly save it over the candidate. The helper stops on unrecorded disk edits or protected changes.

`init` builds the initial checkpoint once. `checkpoint` is only for reviewed manual restState edits, not routine prompts. Both use the cached CLI compiler; neither uploads. Practical lint checks are not a C++ security sandbox or proof of runtime behavior.

## USB and timing

The adapter is matched by VID/PID/serial number, never just a remembered port name. No match or multiple matches stops the operation. When the user reconnects USB, rediscover it. The USB chip identifies the adapter, not the attached ESP32 board model. If hardware changes, review the profile. The previous firmware remains in flash and runs whenever powered, including after USB removal if another power supply is present.

Each job records preparation time and preparation-to-recorded-upload-completion time. This excludes creative interpretation/code generation and optional preview before preparation. A warm-cache unchanged-lighthouse test took 1.357 s to prepare and 62.344 s through recorded flash completion, including IDE interaction, observation, and USB connection. New scenes may take longer; measure rather than promising a fixed end-to-end time.

## Maintenance checks

Run `python3 -m unittest -v test_lightboard.py` after changing the helper, not on every creative request. Coverage includes protected bytes, parser edge cases, compilation/upload failure, port identity/reconnection, no preliminary compile in IDE mode, stable CLI cache, immutable IDE firmware archives, pending-job completion/abort, and previous-animation restoration.

Successful flashing confirms delivery, not visual quality. Viewing the physical panel and checking its buttons still require user feedback. Full prompt, source, firmware, logs, and results are retained in `history/`.

## Resume after closing the chat

Open `/Users/pmartin5/Desktop/Play_Test.Working_Code` as your Codex project and start a new conversation. Select/invoke the project skill **Lightboard** (`$lightboard` in Codex), or ask the assistant to read that project’s `AGENTS.md` and resume the saved workflow. New creative prompts still require the `%%%` suffix. Keep this project folder and `/Users/pmartin5/Desktop/Lightboard_Automation` together on this Mac; the helper paths are personal to this machine. Computer-control access and a connected ESP32 are needed for uploads. This named skill is a reusable entry point, not an autonomous service.
