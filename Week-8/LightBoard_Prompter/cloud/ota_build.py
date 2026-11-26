#!/usr/bin/env python3
"""Prepare/compile an isolated Wi-Fi/OTA pilot, never the live sketch or USB device."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

if __package__:
    from . import build, scene
else:
    import build
    import scene

PROJECT = Path(__file__).resolve().parents[1]
DEVICE = PROJECT / "device"
RUNTIME_FILES = ("LightboardRuntime.h", "LightboardRuntime.cpp", "UpdatePolicy.h")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def source_for(baseline):
    """Every departure from the original sketch is explicit here; restState is unchanged."""
    edits = [
        ('#include <math.h>', '#include <math.h>\n#include <freertos/semphr.h>\n#include "LightboardRuntime.h"'),
        ('portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;',
         'SemaphoreHandle_t displayAccess = nullptr;\nTaskHandle_t displayRefreshTask = nullptr;\n'
         'volatile bool lightboardFlashPaused = false;\nvolatile uint32_t displayRefreshCount = 0;'),
        ('void IRAM_ATTR display_updater() {\n  portENTER_CRITICAL_ISR(&timerMux);\n'
         '  display.display(10);\n  portEXIT_CRITICAL_ISR(&timerMux);\n}',
         'void IRAM_ATTR display_updater() {\n'
         '  BaseType_t taskWoken = pdFALSE;\n'
         '  if (displayRefreshTask) vTaskNotifyGiveFromISR(displayRefreshTask, &taskWoken);\n'
         '  if (taskWoken) portYIELD_FROM_ISR();\n}\n\n'
         'void refreshDisplayTask(void*) {\n'
         '  for (;;) {\n'
         '    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);\n'
         '    if (xSemaphoreTake(displayAccess, portMAX_DELAY) == pdTRUE) {\n'
         '      if (!lightboardFlashPaused) { display.display(10); ++displayRefreshCount; }\n'
         '      else digitalWrite(P_OE, HIGH);\n'
         '      xSemaphoreGive(displayAccess);\n'
         '    }\n'
         '  }\n}'),
        ('// ------------------------- Animation timing',
         'void lightboardFlashGuard(bool paused) {\n'
         '  if (xSemaphoreTake(displayAccess, portMAX_DELAY) == pdTRUE) {\n'
         '    lightboardFlashPaused = paused;\n'
         '    if (paused) digitalWrite(P_OE, HIGH);\n'
         '    xSemaphoreGive(displayAccess);\n'
         '  }\n'
         '}\n'
         'uint32_t lightboardRefreshStackFree() {\n'
         '  return displayRefreshTask ? uxTaskGetStackHighWaterMark(displayRefreshTask) : 0;\n'
         '}\n'
         'uint32_t lightboardRefreshCycles() { return displayRefreshCount; }\n\n'
         '// ------------------------- Animation timing'),
        ('  pinMode(P_OE, OUTPUT);',
         '  displayAccess = xSemaphoreCreateMutex();\n'
         '  if (!displayAccess || xTaskCreatePinnedToCore(refreshDisplayTask, "matrix-refresh",\n'
         '      4096, nullptr, 3, &displayRefreshTask, 1) != pdPASS) {\n'
         '    pinMode(P_OE, OUTPUT); digitalWrite(P_OE, HIGH);\n'
         '    Serial.println("LB_STOP: display task allocation failed; use USB recovery");\n'
         '    for (;;) delay(1000);\n'
         '  }\n\n  pinMode(P_OE, OUTPUT);'),
        ('  Serial.println("Ready: animation");',
         '  Serial.println("Ready: animation");\n  lightboard::begin();'),
        ('  delay(1);', '  lightboard::observeFrame(lastFrame);\n  delay(1);'),
        ('    portENTER_CRITICAL(&timerMux);\n    display.showBuffer();\n    portEXIT_CRITICAL(&timerMux);',
         '    if (xSemaphoreTake(displayAccess, portMAX_DELAY) == pdTRUE) {\n'
         '      display.showBuffer();\n'
         '      xSemaphoreGive(displayAccess);\n'
         '    }'),
    ]
    source = baseline
    for before, after in edits:
        require(source.count(before) == 1, "Unexpected baseline; cannot apply reviewed OTA hooks")
        source = source.replace(before, after, 1)
    a, b = scene.function_span(baseline)
    c, d = scene.function_span(source)
    require(baseline[a:b] == source[c:d], "Baseline animation changed during staging")
    return source


def foundation_material(lock):
    baseline = (build.ROOT / lock["sketch"] / "LightboardBaseline.ino").read_text()
    source = source_for(baseline)
    hashes = {name: build.sha256(DEVICE / "runtime" / name) for name in RUNTIME_FILES}
    hashes["protected_sketch"] = scene.protected_hash(source)
    hashes["partitions.csv"] = build.sha256(build.ROOT / lock["sketch"] / "partitions.csv")
    hashes["build-lock.json"] = build.sha256(build.ROOT / "build-lock.json")
    return source, hashes


def verify_foundation(lock):
    source, hashes = foundation_material(lock)
    sealed = json.loads((DEVICE / "foundation-lock.json").read_text())
    require(sealed["files_sha256"] == hashes, "OTA foundation differs from the reviewed lock")
    identity = scene.digest(json.dumps(hashes, sort_keys=True).encode())
    require(sealed["foundation_id"] == identity, "OTA foundation identity mismatch")
    return source, identity


def write_checked(path, data):
    if path.exists():
        require(path.is_file() and not path.is_symlink() and path.read_bytes() == data,
                "Staged file changed; preserve it and use another work directory")
    else:
        path.write_bytes(data)


def generation_source(record_path):
    """Bind a complete saved response to the same sealed source as the OTA pilot."""
    record, function = scene.load_generation(record_path)
    require(isinstance(record.get("run_id"), str) and
            re.fullmatch(r"[1-9][0-9]*", record["run_id"]), "Generation origin run is required")
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    build.verify(lock)
    baseline, foundation = verify_foundation(lock)
    source = scene.compose(baseline, function, scene.protected_hash(baseline))
    version = "ota-pilot-" + scene.digest((foundation + "\0" + source).encode())[:24]
    return lock, source, foundation, version, record, function


def generation_metadata(record, requested):
    return {"run_id": record["run_id"], "response_sha256": record["response_sha256"],
            "model_request_in_this_run": requested}


def stage(work, candidate=None):
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    build.verify(lock)
    source, foundation = verify_foundation(lock)
    original = source
    if candidate:
        source = scene.compose(source, candidate, scene.protected_hash(original))
    version = "ota-pilot-" + scene.digest((foundation + "\0" + source).encode())[:24]
    folder = work / "LightboardOTA"
    folder.mkdir(parents=True, exist_ok=True)
    require({p.name for p in folder.iterdir()} <= {"LightboardOTA.ino", "partitions.csv", "BuildIdentity.h", *RUNTIME_FILES},
            "Unexpected file in staged sketch")
    write_checked(folder / "LightboardOTA.ino", source.encode())
    write_checked(folder / "partitions.csv", (build.ROOT / lock["sketch"] / "partitions.csv").read_bytes())
    for name in RUNTIME_FILES:
        write_checked(folder / name, (DEVICE / "runtime" / name).read_bytes())
    identity = ('#pragma once\n#define LB_FOUNDATION_ID "' + foundation +
                '"\n#define LB_FIRMWARE_VERSION "' + version + '"\n')
    write_checked(folder / "BuildIdentity.h", identity.encode())
    return folder, lock, foundation, version


def compile_pilot(work, cli, data_dir, candidate=None, release_tag=None, generation_record=None):
    record = None
    if generation_record is not None:
        _, _, _, _, record, function = generation_source(generation_record)
        require(candidate is not None and scene.validate_function(candidate) == function,
                "Candidate differs from the recorded model response")
    folder, lock, foundation, version = stage(work, candidate)
    artifact = work / "artifact"
    require(not artifact.exists(), "OTA artifact already exists; preserve it and choose another work directory")
    metadata = json.loads(subprocess.check_output([str(cli), "version", "--format", "json"]))
    require(metadata.get("VersionString") == lock["arduino_cli_version"], "Pinned Arduino CLI is required")
    config = work / "arduino-cli.yaml"
    config.write_text(json.dumps({"directories": {"data": str(data_dir.resolve()),
        "downloads": str(work / "downloads"), "user": str(work / "user")}}))
    command = [str(cli), "--config-file", str(config)]
    cores = json.loads(subprocess.check_output(command + ["core", "list", "--format", "json"]))
    require(any(p["id"] == lock["core"] and p.get("installed_version") == lock["core_version"]
                for p in cores.get("platforms", [])), "Pinned core is not installed; no automatic upgrade")
    export = work / "export"
    result = subprocess.run(command + ["compile", "--fqbn", lock["fqbn"], "--jobs", "2", "--libraries",
        str(build.ROOT / "vendor"), "--build-path", str(work / "compiler"), "--output-dir", str(export), str(folder)],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (work / "compile.log").write_text(result.stdout)
    require(result.returncode == 0, "OTA pilot compile failed; inspect the local compile.log")
    app = export / "LightboardOTA.ino.bin"
    require(app.is_file() and app.read_bytes()[:1] == b"\xe9" and 0 < app.stat().st_size <= lock["application_slot_bytes"],
            "OTA image missing, invalid, or too large")
    build.verify(lock)
    verify_foundation(lock)
    # The compiler must not leave a changed source/identity in an eligible bundle.
    stage(work, candidate)
    # Files are staged atomically only after compiler and foundation checks succeeded.
    pending = work / "artifact.pending"
    require(not pending.exists(), "Incomplete artifact exists; inspect before retrying")
    pending.mkdir()
    binaries = {}
    for suffix in ("bin", "bootloader.bin", "partitions.bin"):
        name = "LightboardOTA.ino." + suffix
        shutil.copyfile(export / name, pending / name)
        binaries[name] = {"bytes": (pending / name).stat().st_size, "sha256": build.sha256(pending / name)}
    # Retain the exact reviewed inputs for publication validation; never release these files.
    for path in folder.iterdir():
        shutil.copyfile(path, pending / path.name)
    requested = bool(record and record["run_id"] == os.environ.get("GITHUB_RUN_ID"))
    if record is not None:
        (pending / "generation.json").write_text(json.dumps(record, indent=2) + "\n")
    tag = release_tag or "lightboard-ota-local-" + version.removeprefix("ota-pilot-")
    require(re.fullmatch(r"lightboard-ota-[a-z0-9-]{1,96}", tag), "Invalid OTA release tag")
    manifest = {"schema_version": 2, "repository": "pmartin5-gif/HelloWorld", "channel": "ota-pilot",
        "device": "esp32-32x32", "foundation_id": foundation, "ota_enabled": True, "published": False,
        "current": {"version": version, "bytes": app.stat().st_size, "sha256": build.sha256(app),
            "url": "https://github.com/pmartin5-gif/HelloWorld/releases/download/" + tag + "/firmware.bin"}}
    report = {"built_at_utc": datetime.now(timezone.utc).isoformat(), "foundation_id": foundation,
        "build_lock_sha256": build.sha256(build.ROOT / "build-lock.json"),
        "foundation_lock_sha256": build.sha256(DEVICE / "foundation-lock.json"),
        "firmware_version": version, "source_sha256": build.sha256(folder / "LightboardOTA.ino"),
        "ota_protected_sha256": scene.protected_hash((folder / "LightboardOTA.ino").read_text()),
        "baseline_source_sha256": lock["baseline"]["source_sha256"], "core": "esp32:esp32@2.0.17",
        "arduino_cli": lock["arduino_cli_version"], "fqbn": lock["fqbn"], "binaries": binaries,
        "application_slot_bytes": lock["application_slot_bytes"],
        "application_headroom_bytes": lock["application_slot_bytes"] - app.stat().st_size,
        "model_requests": int(requested), "uploaded_to_board": False, "automatic_updates": False,
        "physical_flash_partitions_heap_timing_tls_and_recovery_verified": False}
    if record is not None:
        report["generation"] = generation_metadata(record, requested)
    dram = re.search(r"Global variables use ([\d,]+) bytes", result.stdout)
    if dram:
        report["static_dram_bytes_reported"] = int(dram[1].replace(",", ""))
    for name, value in (("manifest.json", manifest), ("build-report.json", report)):
        (pending / name).write_text(json.dumps(value, indent=2) + "\n")
    (pending / "SHA256SUMS").write_text("".join(f"{build.sha256(p)}  {p.name}\n" for p in sorted(pending.iterdir())))
    pending.rename(artifact)
    print("OTA_PILOT_COMPILED: " + json.dumps(report))
    print("Prepared IDE sketch: " + str(folder / "LightboardOTA.ino"))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--generation-record", type=Path)
    parser.add_argument("--cli", type=Path, default=Path('/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli'))
    parser.add_argument("--data-dir", type=Path, default=Path.home() / 'Library/Arduino15')
    parser.add_argument("--release-tag")
    args = parser.parse_args()
    work = args.work.resolve()
    require((PROJECT / '.build').resolve() in work.parents, "Use an isolated directory inside this project's .build")
    live = Path('/Users/pmartin5/Desktop/Play_Test.Working_Code').resolve()
    require(work != live and live not in work.parents, "Cannot stage into the live sketch")
    work.mkdir(parents=True, exist_ok=True)
    candidate = scene.validate_function(args.candidate.read_text()) if args.candidate else None
    require(not args.generation_record or (args.candidate and not args.prepare_only),
            "--generation-record requires --candidate and compilation")
    if args.prepare_only:
        folder, _, _, version = stage(work, candidate)
        print(f"OTA_PILOT_PREPARED: {folder}; {version}; no compile/upload/network request")
    else:
        compile_pilot(work, args.cli, args.data_dir, candidate, args.release_tag, args.generation_record)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
