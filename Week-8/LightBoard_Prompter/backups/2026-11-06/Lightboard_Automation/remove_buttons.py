#!/usr/bin/env python3
"""One-time, reviewed button removal; routine animation uploads use lightboard.py."""
import argparse
import datetime as dt
import fcntl
import json
import re
import time
from pathlib import Path

import lightboard as board

OLD_FOUNDATION = "e378818cb0023f2e6876ba7fc6dccbb4fd68305710a7b021b63c37e8ee18dcf8"


def candidate(source):
    if board.protected_hash(source) != OLD_FOUNDATION:
        raise RuntimeError("This migration requires the reviewed original button foundation")
    start = source.index("// ------------------------- Buttons -------------------------")
    end = source.index("// ------------------------- Rest:")
    updated = (source[:start] + "// ------------------------- Animation timing -------------------------\n"
               "unsigned long lastFrame = 0;\n"
               "const unsigned long FRAME_INTERVAL_MS = 33;\n\n" + source[end:])
    updated = updated.replace("  initializeButton(greenButton);\n  initializeButton(blueButton);\n\n", "")
    updated = updated.replace("  effectStarted = millis();\n  lastFrame = effectStarted;", "  lastFrame = millis();")
    updated = updated.replace('Ready: koi pond', 'Ready: animation')
    start = updated.index("  bool greenPressed =")
    end = updated.index("  if (now - lastFrame >= FRAME_INTERVAL_MS)", start)
    updated = updated[:start] + updated[end:]
    start = updated.index("    switch (currentScene)")
    end = updated.index("\n\n    // Display the completed frame.", start)
    updated = updated[:start] + "    restState(now);" + updated[end:]
    a, b = board.function_span(source)
    c, d = board.function_span(updated)
    if source[a:b] != updated[c:d]:
        raise RuntimeError("Migration changed the animation")
    return updated.encode()


def prepare(config):
    if config.get("upload_backend") != "arduino-ide":
        raise RuntimeError("This maintenance operation uses Arduino IDE Upload only")
    if board.pending_path().exists():
        raise RuntimeError("Finish or abort the pending IDE upload first")
    state, original = board.load_checked(config)
    updated = candidate(original.decode())
    port = board.discover(config)
    run = board.new_run()
    (run / "before.ino").write_bytes(original)
    (run / "after.ino").write_bytes(updated)
    board.save_json(run / "state-before.json", state)
    metadata = {"maintenance": "remove-buttons", "status": "awaiting_ide_upload",
                "previous_state": state, "source_sha256": board.sha(updated),
                "protected_sha256": board.protected_hash(updated.decode()),
                "port": port, "started_monotonic": time.monotonic(),
                "started_at": dt.datetime.now().isoformat(),
                "firmware_compile": "IDE Upload only"}
    board.save_json(run / "result.json", metadata)
    if Path(config["sketch"]).read_bytes() != original:
        raise RuntimeError("Sketch changed during preparation; refusing to overwrite it")
    board.save_json(board.pending_path(), {"run": str(run), "maintenance": "remove-buttons"})
    board.atomic_write(Path(config["sketch"]), updated)
    print(json.dumps({"status": "awaiting_ide_upload", "history": str(run), "port": port}, indent=2))


def compiled_source_matches(config, updated):
    generated = Path(config["ide_build"]) / "sketch" / (Path(config["sketch"]).name + ".cpp")
    text = generated.read_text()
    # Arduino adds its header, source-location directives, and function prototypes.
    text = re.sub(r'^#include <Arduino.h>\s*\n', '', text, count=1)
    text = re.sub(r'^#line[^\n]*\n', '', text, flags=re.MULTILINE)
    text = re.sub(r'^void (?:restState\(unsigned long now\)|setup\(\)|loop\(\));[^\S\n]*\n',
                  '', text, flags=re.MULTILINE)
    if re.sub(r'\s+', '', text) != re.sub(r'\s+', '', updated.decode()):
        raise RuntimeError("IDE compiled a different foundation; refusing to record button removal")


def complete(config, log_file):
    pending = board.read_json(board.pending_path())
    run = Path(pending["run"])
    metadata = board.read_json(run / "result.json")
    if pending.get("maintenance") != "remove-buttons" or metadata.get("maintenance") != "remove-buttons":
        raise RuntimeError("Pending upload is not the button-removal migration")
    original = (run / "before.ino").read_bytes()
    updated = (run / "after.ino").read_bytes()
    if candidate(original.decode()) != updated or Path(config["sketch"]).read_bytes() != updated:
        raise RuntimeError("Pending migration or working source changed")
    if board.read_json(board.STATE) != metadata["previous_state"]:
        raise RuntimeError("Checkpoint changed while maintenance was pending")
    log = log_file.read_text()
    if "Hash of data verified" not in log or "Hard resetting via RTS pin" not in log:
        raise RuntimeError("IDE log lacks successful flash verification and reset")
    compiled_source_matches(config, updated)
    build = board.archive_ide_firmware(config, updated, run, log)
    (run / "ide-upload.log").write_text(log)
    # This is a foundation-only update: keep the previous-animation restore pointer.
    state = {**metadata["previous_state"], "source_sha256": board.sha(updated),
             "protected_sha256": board.protected_hash(updated.decode())}
    board.finish_state(state, updated, build, run)
    board.save_json(run / "result.json", {**metadata, "status": "uploaded", "build": build,
                    "upload_backend": "arduino-ide", "animation_unchanged": True,
                    "delivery_seconds": round(time.monotonic() - metadata["started_monotonic"], 3)})
    board.pending_path().unlink()
    print(json.dumps({"status": "uploaded", "history": str(run), "animation_unchanged": True}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "complete", "abort"])
    parser.add_argument("--log-file", type=Path)
    args = parser.parse_args()
    if args.command == "complete" and not args.log_file:
        parser.error("complete requires --log-file")
    config = board.read_json(board.CONFIG)
    with (board.ROOT / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command == "prepare":
            prepare(config)
        elif args.command == "complete":
            complete(config, args.log_file)
        else:
            if board.read_json(board.pending_path()).get("maintenance") != "remove-buttons":
                raise RuntimeError("Pending upload is not the button-removal migration")
            board.abort_ide(config)


if __name__ == "__main__":
    main()
