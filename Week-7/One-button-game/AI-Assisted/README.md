# Triangle Hero

A one-button rhythm game with a 200 × 200 pixel canvas. Choose Happy Birthday (Easy), Pink Panther (Medium), or Bleeding The Weak (Hard) while notes approach the target.

## Play

Open **this AI-Assisted folder** with VS Code Live Server, or run the following from this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://127.0.0.1:8000. Loading audio requires an HTTP server rather than opening index.html directly.

- **Space** on Start opens difficulty selection. Use the **arrow keys** to choose and **Space** to confirm. **Easy** uses Happy Birthday and **Medium** uses the edited Pink Panther chart. New songs start with blank charts: map and save at least one note in the editor before playing. Hard uses Bleeding The Weak.
- After choosing Medium, a three-second countdown begins. **Space** strikes a note, resumes after pausing, or replays the results.
- **Escape** stops the round and returns to Start.
- Switching away pauses the song and note movement. Return and press Space to resume.
- Each note counts once. An off-target press consumes the next unresolved note; an unplayed note counts as a miss when it clears the target. The song continues through mistakes.
- Results show hits, misses, and total notes. Every replay starts at the beginning.

## Separate song mapper

Run this command from **AI-Assisted** (it serves both the editor and game):

```sh
python3 editor_server.py
```

Open **http://127.0.0.1:8000/editor/** for editing and **http://127.0.0.1:8000/** for playing. If port 8000 is busy, use `python3 editor_server.py --port 8001` and the URLs it prints. Stop the server with Ctrl+C. The service listens only on your own computer.

Choose **Song to map** at the top: **Easy — Happy Birthday**, **Medium — Pink Panther**, or **Hard — Bleeding The Weak**. Each has its own chart, undo history, and unsaved draft in the current tab. Switching songs stops playback and starts the selected song at zero. Save each draft before closing or refreshing the editor (or export a backup). Happy Birthday is about 44 seconds; Bleeding The Weak is about 184 seconds. Each new song starts blank so you can record exactly the notes you want.

1. Pick a short section using start/end seconds; enable Loop if useful. **Play section** jumps to its start.
2. Use **View length** and the previous/next view controls to show the range you want to replace, then **Clear visible notes** to remove every note in that visible range (including both edges). This follows the timeline view, independently of the loop start/end fields. Undo restores them if needed.
3. Turn **Record taps** on. Press **P** to play/pause, and tap **Space** at triangle strikes. Space ignores held-key repeats. Existing notes outside the cleared section remain. Preview clicks are silent while recording.
4. Turn recording off to hear quiet clicks at chart notes. Try 0.75× or 0.5× speed. Recorded timestamps always use song time, even when slowed or looping. A negative tap correction (for example −80 ms) places new recorded strikes earlier to compensate for reaction delay.
5. Click markers or select a note from the list. Edit its timestamp, nudge by ±10 ms (Shift + arrow: ±1 ms), delete it, or use **Listen around note**. Clicking the waveform away from a marker seeks. Use the position slider and view controls to inspect other sections. Typing fields retain normal keyboard behavior.
6. **Shift every note** moves the whole chart earlier or later. Values are milliseconds. There is no minimum spacing between distinct notes; timestamps retain six decimal places (microsecond precision). Exact duplicate timestamps must be corrected before saving. For close notes, choose a 100 ms or 500 ms view.
7. Click **Save Easy chart to game**, **Save Medium chart to game**, or **Save Hard chart to game**. It writes the selected chart (`Songs/happy-birthday.chart.json`, `Songs/pink-panther.chart.json`, or `Songs/bleeding-the-weak.chart.json`) atomically, retains the previous version in `Songs/.chart-backups/`, and rejects stale saves if another editor has changed the file. Keep that tab open or export your draft before reloading after a conflict. Unsaved edits trigger a browser warning before leaving.
8. Switch to the game and start/replay a round. The game fetches the latest chart each time; a round already in progress stays unchanged.

**Export JSON backup** downloads your draft without updating the game. Use **Restore draft** to bring that backup into the editor, then review and save. When opened through ordinary Live Server, the editor supports editing/preview/export, but direct saving requires `editor_server.py`. After an accidental saved edit, Undo and Save can restore the prior chart while the editor remains open. Older backups can also be copied back over the shared chart.

The editor is separate from the game: there are no recording or editing controls in the player flow. Switching away from the editor pauses playback.

## Chart and timing

`Songs/catalog.json` maps difficulties to their audio and chart files. The Pink Panther chart contains your manual edits; the original automatic analysis proposed 118 metallic-attack candidates before manual correction. Happy Birthday and Bleeding The Weak have independent charts. Saving one difficulty never overwrites either of the other charts.

Edit the `notes` array to correct the chart. Keep timestamps sorted, within the clip duration, with distinct timestamps. Music stays audible through mistakes; the quieter synthesized chime confirms successful input.

The audio clock drives both positions and judgments, independent of frame rate. Note centers reach the target center at their timestamps. At 60 logical pixels/second, the 12-pixel target and 3-pixel note permit ±0.125 seconds of overlap. Overlapping hit windows are supported: each fresh press resolves the nearest pending note, with earlier notes winning ties. Every note still needs a separate press. Final note windows remain playable even if the audio ends first.

To reproduce the candidate chart, decode the M4A to a temporary 16-bit PCM WAV using a local audio converter, then run:

```sh
python tools/chart-triangle.py /path/to/clip.wav Songs/pink-panther.chart.json
```

This development script requires NumPy; the game has no Python package dependencies. Analysis WAVs are not included in the project. Only rerun this script when intentionally replacing the edited chart.

## Checks

```sh
node --check level.js
node --check sketch.js
node tests/game.cjs
node tests/editor.cjs
node tests/editor-ui.cjs
python3 tests/editor_server.py
```

Tests cover timing boundaries, all chart notes, frame-rate independence, duplicate prevention, countdown, screen rendering with p5 stubs, loading/retry/cancellation, pause/resume, Escape, results, and replay. These checks do not establish audible synchronization or transcription accuracy; verify those by playing the full clip in a browser.

Editor checks cover tap recording, slow/loop song-time conversion, waveform drawing with canvas stubs, adjustment/undo, save validation, backups, stale-save rejection, and game chart refresh. A real browser audio playtest is still needed; simulated checks do not verify audible timing.

After changes to the song list or save service, restart `python3 editor_server.py` and refresh the editor and game. Export unsaved drafts before refreshing. The persistent message beside Save explains whether the button is disabled because the draft is empty, unchanged, invalid, or the save service is unavailable.
