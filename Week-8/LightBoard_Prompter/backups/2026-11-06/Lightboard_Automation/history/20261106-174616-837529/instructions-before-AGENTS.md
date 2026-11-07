# Working LED board: prompt-to-animation instructions

## User-authorized workflow

The explicit deployment trigger is a user message ending with **`%%%`**, ignoring trailing whitespace. Interpret the text before the suffix as the creative prompt. A standalone `%%%` refers to the most recently discussed design; if none is available, ask for the missing prompt. When triggered, interpret the idea, generate a replacement restState, compile, and automatically upload it to the USB-connected ESP32. Do not stop after providing copy-and-paste code or ask routine upload permission. Without the suffix, treat creative prompts as discussion/design work and do not change the running animation. The previous phrase-based trigger is retired. Quoted examples or discussion of the suffix itself are not deployment requests. A later explicit user instruction can override this convention. Announce the intended visual briefly, then carry out a triggered update.

Read `/Users/pmartin5/Desktop/Lightboard_Automation/README.md` for operations. Use `lightboard.py` there for deployment and restoration rather than editing the sketch and uploading manually.

## Protected working foundation

- Source of truth: `Play_Test.Working_Code.ino` in this folder.
- Only replace `void restState(unsigned long now)`. Keep supporting structs, state, constants, arrays, and lambdas inside it.
- Preserve both approved face animations and their 3000 ms duration, debouncing, GPIOs, display setup, brightness, double buffering, main loop, and timer configuration byte-for-byte.
- GPIOs: RGB definitions 13/27/26, LAT 22, OE 16, A 19, B 23, C 18, D 5. Buttons 35/34 with external pull-ups. Keep GPIO 16 OUTPUT/LOW before display.begin(16).
- Refresh: display.display(10), timer alarm 1000 microseconds. Animation frame interval 33 ms. Rendering and showBuffer remain in the existing loop.
- Installed board core: ESP32 2.0.17. Configured profile: esp32:esp32:esp32. Do not upgrade dependencies or change profile for an animation.

## Art direction distilled from physical testing

- Design for the physical 32x32 LED grid and its glow, not a detailed computer display. Immediate legibility matters. Use bold silhouettes, deliberate pixels, substantial shapes, saturated colors, and pronounced readable movement.
- Black is an intentional design tool: leave unlit space to isolate subjects and separate accents. Do not fill the display with dim backgrounds, subtle gradients, greyed colors, or decorative clutter.
- Interpret abstract prompts through ONE central visual/emotional idea. Literal objects or abstract patterns are both welcome. Do not try to illustrate every phrase or pile several metaphors into one scene.
- Movement should express the idea: an overflowing heart swells, lifts, and releases smaller hearts; a vulnerable figure reaches into empty space, waits, and must brace again. Strong gestures and meaningful pauses can carry emotion without extra scenery.
- Resting scenes run indefinitely. Make continuity and variation intentional, avoid floating-point precision drift, and resume gracefully after face interruptions. Do not turn a requested unresolved mood into a happy ending.
- The approved happy/sad faces do not prescribe the resting palette, imagery, or effects. They are finished and outside this workflow's scope.
- Favor nonblocking, bounded work per frame and modest fixed-size state. No delay, refresh manipulation, display initialization, showBuffer, serial control, network use, or hardware changes inside restState. Clear/paint the hidden buffer each frame; the loop swaps buffers.

## Short routine for each deployment

1. Reuse this brief and the known project/tool setup within a conversation; don't repeat setup exploration or tests on each prompt. Interpret ONE strong visual idea. Generate the function and exact prompt files under the helper's `incoming/` directory.
2. For scenes needing a composition check, run the existing `preview.py --code ... --output ...` once before deployment and inspect one contact sheet. Skip for simple revisions or already-previewed code. Do not build a renderer, install image packages, or iterate discretionary polish during routine prompts. A preview limitation is not a reason to change good ESP32 code.
3. Use `lightboard.py deploy --code ... --prompt-file ... --description ...`. It protects the sketch, archives source, discovers USB, and prepares the candidate in about a second. It does NOT compile in the current `arduino-ide` backend. A separate status call is only needed for reconnection/troubleshooting; deploy already discovers the adapter.
4. Reuse the Arduino IDE app handle. Verify correct sketch/board/current port and candidate loaded without conflicting edits; at most one focused search if necessary. Clear Output and click Upload ONCE. IDE performs the sole firmware compile and flash using its existing cache. Never also run a CLI compile or extra Verify click. On compiler errors restore with abort-ide and correct up to two errors within restState only.
5. Observe fresh flash verification/reset output, save that observed output, then run `complete-ide`. It archives the IDE-built firmware and checks the generated function and byte count without recompiling. Do not call a pending job delivered. Report outcome concisely; don't claim physical visual/button verification without user feedback.
6. Preserve backups, protected-code checks, and USB rediscovery. `restore` prepares the previous animation and uses the same single IDE upload sequence. On disk/protected mismatches, inspect and explain instead of defeating the checks. User changes to helper/workflow itself authorize necessary maintenance tests even without the creative deployment marker.
