#!/usr/bin/env python3
"""Compile and deliver restState-only changes to the configured LED board."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.json"
STATE = ROOT / "state.json"


def pending_path():
    return ROOT / "pending.json"


def read_json(path):
    return json.loads(path.read_text())


def atomic_write(path, data):
    path = Path(path)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".lightboard-",
                                     suffix=".tmp", delete=False) as output:
        temporary = Path(output.name)
        output.write(data)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def save_json(path, data):
    atomic_write(path, (json.dumps(data, indent=2) + "\n").encode())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def mask_cpp(source):
    """Hide comments/literals, preserving offsets, so their braces are ignored."""
    result = list(source)
    i = 0

    def hide(start, end):
        for j in range(start, end):
            if source[j] not in "\r\n":
                result[j] = " "

    while i < len(source):
        start = i
        if source.startswith("//", i):
            end = source.find("\n", i)
            i = len(source) if end < 0 else end
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            if end < 0:
                raise ValueError("Unterminated C++ comment")
            i = end + 2
        elif source.startswith('R"', i):
            match = re.match(r'R"([^\s()\\]{0,16})\(', source[i:])
            if not match:
                raise ValueError("Invalid C++ raw string")
            terminator = ")" + match.group(1) + '"'
            end = source.find(terminator, i + match.end())
            if end < 0:
                raise ValueError("Unterminated C++ raw string")
            i = end + len(terminator)
        elif source[i] in "\"'":
            quote = source[i]
            i += 1
            while i < len(source):
                if source[i] == "\\":
                    i += 2
                elif source[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
            else:
                raise ValueError("Unterminated C++ literal")
        else:
            i += 1
            continue
        hide(start, min(i, len(source)))
    return "".join(result)


SIGNATURE = re.compile(r"\bvoid\s+restState\s*\(\s*unsigned\s+long\s+now\s*\)\s*\{")


def function_span(source):
    masked = mask_cpp(source)
    matches = list(SIGNATURE.finditer(masked))
    if len(matches) != 1:
        raise ValueError("Expected exactly one void restState(unsigned long now) definition")
    match = matches[0]
    depth = 1
    for i in range(match.end(), len(masked)):
        if masked[i] == "{":
            depth += 1
        elif masked[i] == "}":
            depth -= 1
            if depth == 0:
                return match.start(), i + 1
    raise ValueError("Unbalanced restState braces")


def protected_hash(source):
    start, end = function_span(source)
    return sha((source[:start] + "\0" + source[end:]).encode())


def validate_function(candidate):
    start, end = function_span(candidate)
    masked = mask_cpp(candidate)
    if (masked[:start] + masked[end:]).strip():
        raise ValueError("Candidate must contain only restState; no other definitions or directives")
    body = masked[start:end]
    forbidden = [
        r"^\s*#", r"\b(?:delay|delayMicroseconds|pinMode|digitalWrite|analogWrite)\s*\(",
        r"\b(?:Serial\w*|ESP|WiFi|SPI|Wire)\s*[.:]",
        r"\b(?:timer\w*|setup|loop|abort|exit|yield)\s*\(",
        r"\bdisplay\s*\.\s*(?:begin|display|showBuffer|setBrightness|setFastUpdate|setMux\w*|setScan\w*|setColor\w*|setDriver\w*)\s*\(",
        r"\b(?:while\s*\(\s*(?:true|1)\s*\)|for\s*\(\s*;\s*;\s*\))",
    ]
    for pattern in forbidden:
        if re.search(pattern, body, re.MULTILINE):
            raise ValueError("Candidate touches protected hardware/runtime behavior or blocks forever")
    # This is an editing boundary and a practical lint check, not a C++ security sandbox.
    return candidate[start:end]


def compose(source, candidate):
    replacement = validate_function(candidate)
    start, end = function_span(source)
    updated = source[:start] + replacement + source[end:]
    if protected_hash(updated) != protected_hash(source):
        raise ValueError("Protected sketch bytes changed")
    return updated


def run_cli(config, args, log, timeout=300):
    command = [config["arduino_cli"], "--config-file", config["arduino_config"]] + args
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=timeout, text=True)
        log.write_text(result.stdout)
    except subprocess.TimeoutExpired as exc:
        raw = exc.stdout or b""
        log.write_text(raw.decode(errors="replace") if isinstance(raw, bytes) else raw)
        raise RuntimeError(f"Arduino operation timed out; see {log}") from exc
    if result.returncode:
        raise RuntimeError(f"Arduino operation failed; see {log}\n{result.stdout[-2500:]}")
    return result.stdout


def discover(config):
    output = subprocess.run(
        [config["arduino_cli"], "--config-file", config["arduino_config"],
         "board", "list", "--format", "json"],
        capture_output=True, text=True, timeout=30, check=True)
    inventory = json.loads(output.stdout)
    candidates = []
    for item in inventory.get("detected_ports", []):
        port = item.get("port", {})
        properties = port.get("properties", {})
        if port.get("protocol") == "serial" and all(
            str(properties.get(key, "")).lower() == str(value).lower()
            for key, value in config["usb_identity"].items()
        ):
            candidates.append(port["address"])
    if len(candidates) != 1:
        raise RuntimeError(f"Expected one matching lightboard USB adapter; found {len(candidates)}. "
                           "Reconnect it and run status. No other device will be selected.")
    return candidates[0]


def new_run():
    name = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    path = ROOT / "history" / name
    path.mkdir(parents=True)
    return path


def compile_source(config, source, run, name="candidate"):
    original = Path(config["sketch"])
    # Keep compiler inputs/objects at stable paths; archive only deliverables.
    sketch = ROOT / "cache" / "cli-sketch" / original.parent.name
    shutil.copytree(original.parent, sketch, dirs_exist_ok=True)
    (sketch / original.name).write_bytes(source)
    build = ROOT / "cache" / "cli-build"
    artifacts = run / (name + "-firmware")
    run_cli(config, ["compile", "--fqbn", config["fqbn"],
                    "--build-path", str(build), "--output-dir", str(artifacts),
                    str(sketch)], run / (name + "-compile.log"))
    if not (artifacts / (original.name + ".bin")).exists():
        raise RuntimeError("Compile returned without the expected firmware binary")
    return str(artifacts)


def archive_ide_firmware(config, updated, run, log):
    """Capture the IDE's existing build, without another compilation."""
    build = Path(config["ide_build"])
    options = read_json(build / "build.options.json")
    sketch = Path(config["sketch"])
    if Path(options["sketchLocation"]).resolve() != sketch.parent.resolve():
        raise RuntimeError("IDE cache belongs to a different sketch")
    if ":".join(options["fqbn"].split(":")[:3]) != config["fqbn"]:
        raise RuntimeError("IDE cache belongs to a different board profile")
    generated = build / "sketch" / (sketch.name + ".cpp")
    generated_text = generated.read_bytes().decode()
    a, b = function_span(generated_text)
    source = updated.decode()
    c, d = function_span(source)
    if generated_text[a:b] != source[c:d]:
        raise RuntimeError("IDE compiled a different restState; refusing to checkpoint it")
    binaries = list(build.glob("*.bin"))
    firmware = build / (sketch.name + ".bin")
    if not firmware.exists() or len(binaries) < 3:
        raise RuntimeError("IDE firmware artifacts are missing")
    flashed_sizes = re.findall(r"Wrote\s+(\d+)\s+bytes[^\n]*at\s+0x00010000", log)
    if not flashed_sizes or int(flashed_sizes[-1]) != firmware.stat().st_size:
        raise RuntimeError("Observed upload size does not match IDE firmware")
    destination = run / "ide-firmware"
    destination.mkdir(exist_ok=True)
    for path in binaries + [build / "build.options.json", generated]:
        shutil.copy2(path, destination / path.name)
    return str(destination)


def upload(config, build, port, log):
    run_cli(config, ["upload", "--fqbn", config["fqbn"], "--port", port,
                    "--input-dir", build, str(Path(config["sketch"]).parent)], log, 120)


def load_checked(config):
    state = read_json(STATE)
    source = Path(config["sketch"]).read_bytes()
    text = source.decode("utf-8")
    if protected_hash(text) != state["protected_sha256"]:
        raise RuntimeError("Code outside restState changed. Stop and review the changes before rebaselining.")
    if sha(source) != state["source_sha256"]:
        raise RuntimeError("Sketch has unrecorded edits. Run checkpoint to compile and archive them first.")
    return state, source


def checkpoint(config, initial=False):
    if pending_path().exists():
        raise RuntimeError("Finish or abort the pending IDE upload first")
    if initial and STATE.exists():
        raise RuntimeError("Already initialized; use checkpoint for reviewed local edits")
    source = Path(config["sketch"]).read_bytes()
    text = source.decode("utf-8")
    if not initial and protected_hash(text) != read_json(STATE)["protected_sha256"]:
        raise RuntimeError("Protected code changed; checkpoint refuses to adopt it automatically")
    run = new_run()
    (run / "source.ino").write_bytes(source)
    build = compile_source(config, source, run)
    state = {"source_sha256": sha(source), "protected_sha256": protected_hash(text),
             "source_archive": str(run / "source.ino"), "build": build,
             "firmware_delivery": "compiled; not uploaded by checkpoint"}
    save_json(STATE, state)
    save_json(run / "result.json", {"status": "checkpoint", **state})
    print(json.dumps({"status": "checkpoint", "archive": str(run), "build": build}, indent=2))


def deploy(config, candidate, prompt, description):
    started = time.monotonic()
    if pending_path().exists():
        raise RuntimeError("Finish or abort the pending IDE upload first")
    state, original = load_checked(config)
    updated = compose(original.decode("utf-8"), candidate).encode()
    # Detect connection problems before doing any work or changing the sketch.
    port = discover(config)
    run = new_run()
    (run / "before.ino").write_bytes(original)
    (run / "after.ino").write_bytes(updated)
    (run / "restState.cpp").write_text(validate_function(candidate) + "\n")
    (run / "prompt.txt").write_text(prompt)
    metadata = {"description": description, "previous_state": state, "status": "preparing",
                "started_monotonic": started, "started_at": dt.datetime.now().isoformat()}
    save_json(run / "result.json", metadata)
    ide = config.get("upload_backend") == "arduino-ide"
    build = None
    if not ide:
        try:
            build = compile_source(config, updated, run)
        except Exception as exc:
            save_json(run / "result.json", {**metadata, "status": "compile_failed", "error": str(exc)})
            raise
        # A port can change during the CLI compilation.
        port = discover(config)
    if Path(config["sketch"]).read_bytes() != original:
        raise RuntimeError("Sketch changed during preparation; refusing to overwrite it")
    atomic_write(Path(config["sketch"]), updated)
    metadata.update(status="uploading", port=port, build=build)
    save_json(run / "result.json", metadata)
    if ide:
        metadata.update(status="awaiting_ide_upload", source_sha256=sha(updated),
                        firmware_compile="IDE Upload only", prepare_seconds=round(time.monotonic()-started, 3))
        save_json(run / "result.json", metadata)
        save_json(pending_path(), {"run": str(run)})
        print(json.dumps({"status": "awaiting_ide_upload", "port": port,
                          "history": str(run), "sketch": config["sketch"],
                          "prepare_seconds": metadata["prepare_seconds"],
                          "firmware_compile": "IDE Upload only",
                          "protected_code_unchanged": True}, indent=2))
        return
    try:
        upload(config, build, port, run / "upload.log")
    except Exception as exc:
        atomic_write(Path(config["sketch"]), original)
        recovery = "not attempted"
        try:
            recovery_port = discover(config)
            upload(config, state["build"], recovery_port, run / "recovery-upload.log")
            recovery = "previous firmware uploaded successfully"
        except Exception as recovery_exc:
            recovery = "FAILED: " + str(recovery_exc)
        save_json(run / "result.json", {**metadata, "status": "upload_failed",
                                       "error": str(exc), "recovery": recovery})
        raise RuntimeError(f"Upload failed. Previous source restored. Recovery: {recovery}. See {run}") from exc
    finish_state(state, updated, build, run)
    save_json(run / "result.json", {**metadata, "status": "uploaded", "source_sha256": sha(updated)})
    print(json.dumps({"status": "uploaded", "port": port, "history": str(run),
                      "protected_code_unchanged": True}, indent=2))


def finish_state(state, updated, build, run):
    previous = (state.get("previous_source_archive") if sha(updated) == state["source_sha256"]
                else state["source_archive"])
    new_state = {"source_sha256": sha(updated), "protected_sha256": state["protected_sha256"],
                 "source_archive": str(run / "after.ino"), "build": build,
                 "previous_source_archive": previous,
                 "firmware_delivery": "upload tool verified flash and requested restart"}
    save_json(STATE, new_state)


def complete_ide(config, log_file):
    pending = read_json(pending_path())
    run = Path(pending["run"])
    metadata = read_json(run / "result.json")
    updated = (run / "after.ino").read_bytes()
    if Path(config["sketch"]).read_bytes() != updated:
        raise RuntimeError("Working sketch differs from the pending upload")
    log = log_file.read_text()
    if "Hash of data verified" not in log or "Hard resetting via RTS pin" not in log:
        raise RuntimeError("IDE log lacks successful flash verification and reset; do not mark delivered")
    (run / "ide-upload.log").write_text(log)
    if metadata.get("build"):
        # Permit completion of a job prepared by the previous helper version.
        build = metadata["build"]
    else:
        build = archive_ide_firmware(config, updated, run, log)
    finish_state(metadata["previous_state"], updated, build, run)
    elapsed = round(time.monotonic() - metadata.get("started_monotonic", time.monotonic()), 3)
    save_json(run / "result.json", {**metadata, "status": "uploaded", "upload_backend": "arduino-ide",
                                   "build": build, "delivery_seconds": elapsed})
    pending_path().unlink()
    print(json.dumps({"status": "uploaded", "history": str(run),
                      "delivery_seconds": elapsed,
                      "upload_backend": "arduino-ide", "protected_code_unchanged": True}, indent=2))


def abort_ide(config):
    run = Path(read_json(pending_path())["run"])
    metadata = read_json(run / "result.json")
    original = (run / "before.ino").read_bytes()
    current = Path(config["sketch"]).read_bytes()
    if current not in (original, (run / "after.ino").read_bytes()):
        raise RuntimeError("Unrelated disk edits detected; refusing automatic restoration")
    atomic_write(Path(config["sketch"]), original)
    save_json(run / "result.json", {**metadata, "status": "ide_upload_aborted",
                                   "recovery": "source restored; agent must upload it through IDE if flashing began"})
    pending_path().unlink()
    print(json.dumps({"status": "source_restored", "history": str(run),
                      "firmware_recovery": "Upload restored source through Arduino IDE if necessary"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    sub.add_parser("init")
    sub.add_parser("checkpoint")
    sub.add_parser("restore")
    sub.add_parser("abort-ide")
    complete = sub.add_parser("complete-ide")
    complete.add_argument("--log-file", type=Path, required=True)
    apply = sub.add_parser("deploy")
    apply.add_argument("--code", type=Path, required=True)
    apply.add_argument("--prompt-file", type=Path, required=True)
    apply.add_argument("--description", default="New resting animation")
    args = parser.parse_args()
    config = read_json(CONFIG)
    with (ROOT / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another lightboard operation is running")
        if args.command == "status":
            port = discover(config)
            state = read_json(STATE) if STATE.exists() else None
            source = Path(config["sketch"]).read_bytes()
            print(json.dumps({"port": port, "fqbn": config["fqbn"], "sketch": config["sketch"],
                              "initialized": bool(state),
                              "upload_backend": config.get("upload_backend", "cli"),
                              "pending_ide_upload": read_json(pending_path()) if pending_path().exists() else None,
                              "source_matches_checkpoint": bool(state and sha(source) == state["source_sha256"]),
                              "protected_code_matches": bool(state and protected_hash(source.decode()) == state["protected_sha256"])}, indent=2))
        elif args.command in ("init", "checkpoint"):
            checkpoint(config, initial=args.command == "init")
        elif args.command == "complete-ide":
            complete_ide(config, args.log_file)
        elif args.command == "abort-ide":
            abort_ide(config)
        elif args.command == "restore":
            state, _ = load_checked(config)
            previous = state.get("previous_source_archive")
            if not previous:
                raise RuntimeError("No previous deployment is available")
            text = Path(previous).read_bytes().decode()
            start, end = function_span(text)
            deploy(config, text[start:end], "Restore the previous resting animation", "Restored previous animation")
        else:
            deploy(config, args.code.read_bytes().decode(), args.prompt_file.read_text(), args.description)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
