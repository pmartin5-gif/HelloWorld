# Lightboard agent instructions

Recorded on November 2, 2026.

This document collects the complete saved Lightboard skill instructions, its project instructions, and its operating guide, followed by the saved skill interface and machine configuration. These are the persisted instructions available on disk; this document does not claim to reproduce unsaved conversations. Repeated rules are retained so none of the source instructions are lost. Source heading levels are adjusted for this document, and the skill's project-instructions link is expanded to its original absolute destination.

## Working location and existing implementation

Our working folder for organizing and extending this workflow is:

`/Users/pmartin5/Documents/GitHub/HelloWorld/Week-8/LightBoard_Prompter`

It belongs to the `pmartin5-gif/HelloWorld` repository. The existing firmware and automation remain at the Desktop paths documented below. Creating this document does not migrate those files, change the configured sketch, or upload an animation. The existing skill's original resume instructions are retained below as a record of the saved setup; use this new folder for our ongoing organizational work.

The Lightboard skill is a reusable entry point for a chat-operated workflow. It interprets creative prompts, generates a resting animation for a physical 32×32 ESP32 LED panel, and deploys authorized updates through Arduino IDE. It is not an autonomous background agent.

## Contents

1. [Saved Lightboard skill](#saved-lightboard-skill)
2. [Saved project instructions](#saved-project-instructions)
3. [Saved operating guide](#saved-operating-guide)
4. [Saved skill interface](#saved-skill-interface)
5. [Saved machine configuration](#saved-machine-configuration)

## Saved Lightboard skill

Source: `/Users/pmartin5/Desktop/Play_Test.Working_Code/.agents/skills/lightboard/SKILL.md`

Skill metadata:

```yaml
name: lightboard
description: "Interpret feelings and creative prompts as expressive 32x32 LED animations for this user's ESP32 Lightboard. Resume its saved workflow, discuss designs, or replace only restState and deploy when the user ends a prompt with %%%. Also handle USB reconnection and restoring previous animations."
```

### Lightboard

Resume the user's established prompt-to-LED workflow on this Mac without needing the original chat. This skill is a named entry point to the existing project, not a separate background service.

#### Load the saved project

- Working project: `/Users/pmartin5/Desktop/Play_Test.Working_Code`.
- Read [the project instructions](/Users/pmartin5/Desktop/Play_Test.Working_Code/AGENTS.md) for current hardware constraints, art direction, authorization, and the short deployment routine.
- Read `/Users/pmartin5/Desktop/Lightboard_Automation/README.md` for helper commands and IDE completion/recovery details. Reuse this context within a session rather than rereading it for every prompt.
- The source, configuration, checkpoint, backups, firmware snapshots, and history are on disk. Do not reconstruct the firmware from this skill or examples.

#### Understand when to act

A user message ending with `%%%`, ignoring trailing whitespace, authorizes interpreting the preceding creative prompt and carrying it through deployment. A standalone marker refers to the most recently discussed design; ask for the design only if none is available. Without the suffix, discuss/design without changing the running panel. Quoted marker examples, instructions about the workflow, or merely invoking this skill do not upload anything. Explicit maintenance or restoration requests authorize that scoped work separately.

Preserve only the approved boundary: replace `void restState(unsigned long now)`. Do not change face effects, button logic/duration, wiring, brightness, refresh timing, or double buffering. The current approved face duration is 3000 ms; verify live project files rather than assuming old conversation values.

#### Make compelling LED art

Choose ONE emotionally legible image or abstract rhythm. Use bold shapes, saturated colors, intentional black space, and movement that carries the feeling. Account for the 32x32 physical grid and LED glow. Do not illustrate every phrase, rely on tiny details or muted gradients, or overload the display. Resting scenes run indefinitely: use continuity, intentional variation, bounded time/state, and graceful resumption after face effects.

#### Execute the existing fast workflow

Use `/Users/pmartin5/Desktop/Lightboard_Automation/lightboard.py`, not manual function selection/pasting in the IDE. The helper enforces protected bytes, archives changes, discovers the USB adapter by identity, and stages the candidate. Never overwrite unreviewed changes or defeat a checkpoint mismatch.

Use the existing optional `preview.py` for one contact sheet when helpful; do not develop a renderer during a creative request. Do not rerun setup tests, browse general documentation, upgrade dependencies, or add a preliminary firmware compilation for a routine scene.

The current environment blocks direct shell serial access. The configured `arduino-ide` backend requires supported native computer control: inspect Arduino IDE, ensure the prepared candidate is loaded in the correct sketch/board/port, clear old output, and click Upload once. Use fresh UI state, not remembered element indices. The IDE performs the only firmware compile and flash using its warm cache. Observe fresh successful flash verification/reset, save the actual observed output, and run `complete-ide` to archive the matching IDE-built firmware and checkpoint delivery. Never mark a staged job uploaded.

On reconnect, rediscover USB with `status`; do not assume the old port name. If USB or computer control is unavailable, report the specific missing prerequisite and do not guess another device or claim delivery. Limit generated-code compile corrections to two; restore prior source with `abort-ide` on failure, and follow README recovery if flashing began. Keep the previous animation available through `restore`.

Announce the intended visual briefly and finish with a concise, factual upload result. Successful flashing is not proof of physical visual quality or button behavior; those require user observation.

## Saved project instructions

Source: `/Users/pmartin5/Desktop/Play_Test.Working_Code/AGENTS.md`

### Working LED board: prompt-to-animation instructions

#### User-authorized workflow

The explicit deployment trigger is a user message ending with **`%%%`**, ignoring trailing whitespace. Interpret the text before the suffix as the creative prompt. A standalone `%%%` refers to the most recently discussed design; if none is available, ask for the missing prompt. When triggered, interpret the idea, generate a replacement restState, compile, and automatically upload it to the USB-connected ESP32. Do not stop after providing copy-and-paste code or ask routine upload permission. Without the suffix, treat creative prompts as discussion/design work and do not change the running animation. The previous phrase-based trigger is retired. Quoted examples or discussion of the suffix itself are not deployment requests. A later explicit user instruction can override this convention. Announce the intended visual briefly, then carry out a triggered update.

Read `/Users/pmartin5/Desktop/Lightboard_Automation/README.md` for operations. Use `lightboard.py` there for deployment and restoration rather than editing the sketch and uploading manually.

#### Protected working foundation

- Source of truth: `Play_Test.Working_Code.ino` in this folder.
- Only replace `void restState(unsigned long now)`. Keep supporting structs, state, constants, arrays, and lambdas inside it.
- Preserve both approved face animations and their 3000 ms duration, debouncing, GPIOs, display setup, brightness, double buffering, main loop, and timer configuration byte-for-byte.
- GPIOs: RGB definitions 13/27/26, LAT 22, OE 16, A 19, B 23, C 18, D 5. Buttons 35/34 with external pull-ups. Keep GPIO 16 OUTPUT/LOW before display.begin(16).
- Refresh: display.display(10), timer alarm 1000 microseconds. Animation frame interval 33 ms. Rendering and showBuffer remain in the existing loop.
- Installed board core: ESP32 2.0.17. Configured profile: esp32:esp32:esp32. Do not upgrade dependencies or change profile for an animation.

#### Art direction distilled from physical testing

- Design for the physical 32x32 LED grid and its glow, not a detailed computer display. Immediate legibility matters. Use bold silhouettes, deliberate pixels, substantial shapes, saturated colors, and pronounced readable movement.
- Black is an intentional design tool: leave unlit space to isolate subjects and separate accents. Do not fill the display with dim backgrounds, subtle gradients, greyed colors, or decorative clutter.
- Interpret abstract prompts through ONE central visual/emotional idea. Literal objects or abstract patterns are both welcome. Do not try to illustrate every phrase or pile several metaphors into one scene.
- Movement should express the idea: an overflowing heart swells, lifts, and releases smaller hearts; a vulnerable figure reaches into empty space, waits, and must brace again. Strong gestures and meaningful pauses can carry emotion without extra scenery.
- Resting scenes run indefinitely. Make continuity and variation intentional, avoid floating-point precision drift, and resume gracefully after face interruptions. Do not turn a requested unresolved mood into a happy ending.
- The approved happy/sad faces do not prescribe the resting palette, imagery, or effects. They are finished and outside this workflow's scope.
- Favor nonblocking, bounded work per frame and modest fixed-size state. No delay, refresh manipulation, display initialization, showBuffer, serial control, network use, or hardware changes inside restState. Clear/paint the hidden buffer each frame; the loop swaps buffers.

#### Short routine for each deployment

1. Reuse this brief and the known project/tool setup within a conversation; don't repeat setup exploration or tests on each prompt. Interpret ONE strong visual idea. Generate the function and exact prompt files under the helper's `incoming/` directory.
2. For scenes needing a composition check, run the existing `preview.py --code ... --output ...` once before deployment and inspect one contact sheet. Skip for simple revisions or already-previewed code. Do not build a renderer, install image packages, or iterate discretionary polish during routine prompts. A preview limitation is not a reason to change good ESP32 code.
3. Use `lightboard.py deploy --code ... --prompt-file ... --description ...`. It protects the sketch, archives source, discovers USB, and prepares the candidate in about a second. It does NOT compile in the current `arduino-ide` backend. A separate status call is only needed for reconnection/troubleshooting; deploy already discovers the adapter.
4. Reuse the Arduino IDE app handle. Verify correct sketch/board/current port and candidate loaded without conflicting edits; at most one focused search if necessary. Clear Output and click Upload ONCE. IDE performs the sole firmware compile and flash using its existing cache. Never also run a CLI compile or extra Verify click. On compiler errors restore with abort-ide and correct up to two errors within restState only.
5. Observe fresh flash verification/reset output, save that observed output, then run `complete-ide`. It archives the IDE-built firmware and checks the generated function and byte count without recompiling. Do not call a pending job delivered. Report outcome concisely; don't claim physical visual/button verification without user feedback.
6. Preserve backups, protected-code checks, and USB rediscovery. `restore` prepares the previous animation and uses the same single IDE upload sequence. On disk/protected mismatches, inspect and explain instead of defeating the checks. User changes to helper/workflow itself authorize necessary maintenance tests even without the creative deployment marker.

## Saved operating guide

Source: `/Users/pmartin5/Desktop/Lightboard_Automation/README.md`

### Prompt-to-LED workflow

A user message ending in **`%%%`** (ignoring trailing whitespace) requests automatic generation and deployment of a resting animation. Interpret the preceding text as the creative prompt. A standalone marker refers to the most recently discussed design. Discussion or quoted examples of the marker do not trigger deployment. Without the suffix, discuss/design without changing the panel. Later explicit user instructions may override this convention.

This is a chat-operated workflow: an active Codex session performs the generation and Arduino IDE interaction. It is not a background watcher or separate model API application.

Working sketch: `/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino`. Read that folder's `AGENTS.md` when starting a new conversation. Keep the installed ESP32 core 2.0.17, board profile, libraries, wiring, both face effects, 3000 ms timing, and double buffering unchanged.

#### Short routine path

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

#### One compilation, reused build files

Direct serial read/write is blocked in this execution environment; Arduino IDE's native Upload control works. `config.json` selects `arduino-ide` and records the existing IDE build-cache directory. The sketch remains at its original path so IDE can reuse unchanged library/core objects. Do not clear caches, change board settings, or run a second compiler as part of a normal update.

After the verified upload, `complete-ide` archives the IDE-built `.bin` files, build options, and generated C++ without recompiling. It checks the cache's sketch/board identity, exact restState match, and uploaded byte count before recording delivery. If the cache path changes, locate the matching `build.options.json` by its `sketchLocation` and board profile; don't guess or declare success with stale firmware. The same applies to conflicting unsaved IDE buffers.

The optional CLI backend also uses stable `cache/cli-sketch` and `cache/cli-build` paths and exports immutable firmware snapshots into history. It remains for environments where direct serial access is available. Do not use a terminal UI to evade this environment's serial restriction.

#### Reusable preview

`preview.py` uses the checked-in `preview_gfx.h` mock, clang++, and Python's standard library. No Pillow, package installs, or handwritten renderer per request. It compiles a small desktop renderer for new code (not ESP32 firmware), caches it by source/header/sample-time hash, simulates approximately 30 FPS, and produces one nearest-neighbor PNG contact sheet. Default samples: 100, 1000, 3000, and 6000 ms. Override with `--times-ms` if another point in the animation matters.

The preview is optional and limited: it is not ESP32 execution, exact Adafruit rasterization, PxMatrix scanning, LED glow, or a video of the physical board. Unsupported drawing APIs or a preview timeout should not launch a renderer-development detour. Inspect the code instead and let the real Arduino compiler validate it. Fix a clear readability defect before deployment; leave discretionary refinements to user feedback.

Measured during the optimization: first lighthouse preview 0.783 s; cached preview 0.027 s. These are local measurements, not guarantees for arbitrary scenes.

#### Failure handling and recovery

- Structural/protected-code/USB failure: stop before changing the working sketch.
- In IDE mode source is prepared before the single compilation. If compilation fails, IDE does not flash it; run `abort-ide` to restore the prior source. Correct at most two generated-code errors and retry within restState only. Never change protected code or dependencies to fix a generated scene.
- Upload failure: `abort-ide` restores source. If flashing started, upload the restored source through IDE once, then report whether recovery succeeded. The prior firmware snapshot remains archived.
- `complete-ide` requires freshly observed `Hash of data verified` and `Hard resetting via RTS pin` output, current disk bytes matching the candidate, and matching IDE artifacts. Until completion/abort, the pending job blocks new deployments.
- Arduino IDE may hold a stale in-memory version. Do not blindly save it over the candidate. The helper stops on unrecorded disk edits or protected changes.

`init` builds the initial checkpoint once. `checkpoint` is only for reviewed manual restState edits, not routine prompts. Both use the cached CLI compiler; neither uploads. Practical lint checks are not a C++ security sandbox or proof of runtime behavior.

#### USB and timing

The adapter is matched by VID/PID/serial number, never just a remembered port name. No match or multiple matches stops the operation. When the user reconnects USB, rediscover it. The USB chip identifies the adapter, not the attached ESP32 board model. If hardware changes, review the profile. The previous firmware remains in flash and runs whenever powered, including after USB removal if another power supply is present.

Each job records preparation time and preparation-to-recorded-upload-completion time. This excludes creative interpretation/code generation and optional preview before preparation. A warm-cache unchanged-lighthouse test took 1.357 s to prepare and 62.344 s through recorded flash completion, including IDE interaction, observation, and USB connection. New scenes may take longer; measure rather than promising a fixed end-to-end time.

#### Maintenance checks

Run `python3 -m unittest -v test_lightboard.py` after changing the helper, not on every creative request. Coverage includes protected bytes, parser edge cases, compilation/upload failure, port identity/reconnection, no preliminary compile in IDE mode, stable CLI cache, immutable IDE firmware archives, pending-job completion/abort, and previous-animation restoration.

Successful flashing confirms delivery, not visual quality. Viewing the physical panel and checking its buttons still require user feedback. Full prompt, source, firmware, logs, and results are retained in `history/`.

#### Resume after closing the chat

Open `/Users/pmartin5/Desktop/Play_Test.Working_Code` as your Codex project and start a new conversation. Select/invoke the project skill **Lightboard** (`$lightboard` in Codex), or ask the assistant to read that project’s `AGENTS.md` and resume the saved workflow. New creative prompts still require the `%%%` suffix. Keep this project folder and `/Users/pmartin5/Desktop/Lightboard_Automation` together on this Mac; the helper paths are personal to this machine. Computer-control access and a connected ESP32 are needed for uploads. This named skill is a reusable entry point, not an autonomous service.

## Saved skill interface

Source: `/Users/pmartin5/Desktop/Play_Test.Working_Code/.agents/skills/lightboard/agents/openai.yaml`

```yaml
interface:
  display_name: "Lightboard"
  short_description: "Turn creative prompts into expressive LED animations"
  default_prompt: "Use $lightboard to resume my saved ESP32 workflow; upload new animations only when my prompt ends with %%%."
```

## Saved machine configuration

Source: `/Users/pmartin5/Desktop/Lightboard_Automation/config.json`

This is a snapshot of the existing setup, not a fresh hardware or cache verification. Rediscover the USB port on reconnection and verify the configured build artifacts when completing an upload. If the implementation changes, reconcile this snapshot with the live project files.

```json
{
  "sketch": "/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino",
  "arduino_cli": "/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli",
  "arduino_config": "/Users/pmartin5/.arduinoIDE/arduino-cli.yaml",
  "fqbn": "esp32:esp32:esp32",
  "upload_backend": "arduino-ide",
  "ide_build": "/Users/pmartin5/Library/Caches/arduino/sketches/0CFCE85B0D9E2A2FC14091EB9C264B0A",
  "usb_identity": {
    "vid": "0x10C4",
    "pid": "0xEA60",
    "serialNumber": "0001"
  }
}
```
