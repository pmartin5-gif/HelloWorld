---
name: lightboard
description: "Interpret feelings and creative prompts as expressive 32x32 LED animations for this user's ESP32 Lightboard. Resume its saved workflow, discuss designs, or replace only restState and deploy when the user ends a prompt with %%%. Also handle USB reconnection and restoring previous animations."
---

# Lightboard

Resume the user's established prompt-to-LED workflow on this Mac without needing the original chat. This skill is a named entry point to the existing project, not a separate background service.

## Load the saved project

- Working project: `/Users/pmartin5/Desktop/Play_Test.Working_Code`.
- Read [the project instructions](../../../AGENTS.md) for current hardware constraints, art direction, authorization, and the short deployment routine.
- Read `/Users/pmartin5/Desktop/Lightboard_Automation/README.md` for helper commands and IDE completion/recovery details. Reuse this context within a session rather than rereading it for every prompt.
- The source, configuration, checkpoint, backups, firmware snapshots, and history are on disk. Do not reconstruct the firmware from this skill or examples.

## Understand when to act

A user message ending with `%%%`, ignoring trailing whitespace, authorizes interpreting the preceding creative prompt and carrying it through deployment. A standalone marker refers to the most recently discussed design; ask for the design only if none is available. Without the suffix, discuss/design without changing the running panel. Quoted marker examples, instructions about the workflow, or merely invoking this skill do not upload anything. Explicit maintenance or restoration requests authorize that scoped work separately.

Preserve only the approved boundary: replace `void restState(unsigned long now)`. Do not change face effects, button logic/duration, wiring, brightness, refresh timing, or double buffering. The current approved face duration is 3000 ms; verify live project files rather than assuming old conversation values.

## Make compelling LED art

Choose ONE emotionally legible image or abstract rhythm. Use bold shapes, saturated colors, intentional black space, and movement that carries the feeling. Account for the 32x32 physical grid and LED glow. Do not illustrate every phrase, rely on tiny details or muted gradients, or overload the display. Resting scenes run indefinitely: use continuity, intentional variation, bounded time/state, and graceful resumption after face effects.

## Execute the existing fast workflow

Use `/Users/pmartin5/Desktop/Lightboard_Automation/lightboard.py`, not manual function selection/pasting in the IDE. The helper enforces protected bytes, archives changes, discovers the USB adapter by identity, and stages the candidate. Never overwrite unreviewed changes or defeat a checkpoint mismatch.

Use the existing optional `preview.py` for one contact sheet when helpful; do not develop a renderer during a creative request. Do not rerun setup tests, browse general documentation, upgrade dependencies, or add a preliminary firmware compilation for a routine scene.

The current environment blocks direct shell serial access. The configured `arduino-ide` backend requires supported native computer control: inspect Arduino IDE, ensure the prepared candidate is loaded in the correct sketch/board/port, clear old output, and click Upload once. Use fresh UI state, not remembered element indices. The IDE performs the only firmware compile and flash using its warm cache. Observe fresh successful flash verification/reset, save the actual observed output, and run `complete-ide` to archive the matching IDE-built firmware and checkpoint delivery. Never mark a staged job uploaded.

On reconnect, rediscover USB with `status`; do not assume the old port name. If USB or computer control is unavailable, report the specific missing prerequisite and do not guess another device or claim delivery. Limit generated-code compile corrections to two; restore prior source with `abort-ide` on failure, and follow README recovery if flashing began. Keep the previous animation available through `restore`.

Announce the intended visual briefly and finish with a concise, factual upload result. Successful flashing is not proof of physical visual quality or button behavior; those require user observation.
