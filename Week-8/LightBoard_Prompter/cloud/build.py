#!/usr/bin/env python3
"""Compile the preserved baseline or a validated restState replacement; never upload."""

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
import tempfile
import uuid

if __package__:
    from .scene import compose, digest, load_generation, validate_function
else:
    from scene import compose, digest, load_generation, validate_function

ROOT = Path(__file__).resolve().parent
WORK = ROOT.parent / ".build"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(lock):
    expected = lock["files_sha256"]
    actual = {
        p.relative_to(ROOT).as_posix()
        for folder in ("firmware", "vendor")
        for p in (ROOT / folder).rglob("*")
        if p.is_file()
    }
    if actual != set(expected):
        raise ValueError("Baseline/library file inventory differs from build-lock.json")
    for relative, digest in expected.items():
        path = ROOT / relative
        if path.is_symlink() or sha256(path) != digest:
            raise ValueError(f"Preserved build input changed: {relative}")
    for name, version in lock["libraries"].items():
        properties = dict(
            line.split("=", 1)
            for line in (ROOT / "vendor" / name / "library.properties").read_text().splitlines()
            if "=" in line and not line.startswith("#")
        )
        if properties.get("version") != version:
            raise ValueError(f"Library version changed: {name}")
    source = ROOT / lock["sketch"] / "LightboardBaseline.ino"
    if sha256(source) != lock["baseline"]["source_sha256"]:
        raise ValueError("Baseline source differs from the recorded uploaded checkpoint")
    print(f"Verified {len(expected)} pinned source/library files.", flush=True)


def run(command, capture=False):
    result = subprocess.run([str(arg) for arg in command], check=True, text=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.STDOUT if capture else None)
    if capture:
        return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--install-core", action="store_true", help="Download the pinned core into isolated data")
    parser.add_argument("--cli", default="arduino-cli")
    parser.add_argument("--data-dir", type=Path, help="Use an existing Arduino data folder for an offline local check")
    parser.add_argument("--candidate", type=Path, help="Validate and compile only restState in an isolated baseline copy")
    parser.add_argument("--generation-record", type=Path, help="Bind a generated candidate to its exact API response")
    args = parser.parse_args()
    artifact = WORK / ("candidate-artifact" if args.candidate else "artifact")
    # Clear only this build mode's previous bundle, even when validation fails.
    if not args.verify_only and artifact.exists():
        shutil.rmtree(artifact)
    if args.generation_record and not args.candidate:
        raise ValueError("--generation-record requires --candidate")
    lock = json.loads((ROOT / "build-lock.json").read_text())
    verify(lock)
    baseline_source = ROOT / lock["sketch"] / "LightboardBaseline.ino"
    generation = None
    candidate = None
    updated = baseline_source.read_text()
    if args.candidate:
        candidate = validate_function(args.candidate.read_text())
        if args.generation_record:
            generation, generated_function = load_generation(args.generation_record)
            if generated_function != candidate:
                raise ValueError("Candidate differs from the recorded model response")
        updated = compose(updated, candidate, lock["baseline"]["protected_sha256"])
    if args.verify_only:
        return 0
    if args.install_core and args.data_dir:
        raise ValueError("Do not install or alter the existing local Arduino data folder")

    version = json.loads(subprocess.check_output([args.cli, "version", "--format", "json"]))
    if version.get("VersionString") != lock["arduino_cli_version"]:
        raise ValueError(f"Arduino CLI {lock['arduino_cli_version']} is required")
    WORK.mkdir(exist_ok=True)
    config = WORK / "arduino-cli.yaml"
    data_dir = args.data_dir.resolve() if args.data_dir else WORK / "arduino-data"
    # JSON is also valid YAML. Keep user libraries and builds isolated from the live IDE.
    config.write_text(json.dumps({
        "directories": {
            "data": str(data_dir),
            "downloads": str(WORK / "downloads"),
            "user": str(WORK / "user"),
        },
        "board_manager": {"additional_urls": [lock["platform_index_url"]]},
    }, indent=2))
    cli = [args.cli, "--config-file", config]
    if args.install_core:
        run(cli + ["core", "update-index"])
        run(cli + ["core", "install", f"{lock['core']}@{lock['core_version']}"])

    platforms = json.loads(subprocess.check_output(
        [str(x) for x in cli + ["core", "list", "--format", "json"]]
    )).get("platforms", [])
    if not any(p["id"] == lock["core"] and p.get("installed_version") == lock["core_version"] for p in platforms):
        raise ValueError("The pinned ESP32 core is not installed in the selected data folder")

    with tempfile.TemporaryDirectory(prefix="compile-", dir=WORK) as temporary:
        temporary = Path(temporary)
        export = temporary / "export"
        sketch = ROOT / lock["sketch"]
        if candidate is not None:
            sketch = temporary / "LightboardBaseline"
            shutil.copytree(ROOT / lock["sketch"], sketch)
            (sketch / "LightboardBaseline.ino").write_text(updated)
        try:
            compile_log = run(cli + [
                "compile", "--fqbn", lock["fqbn"], "--jobs", "2",
                "--libraries", ROOT / "vendor", "--build-path", temporary / "build",
                "--output-dir", export, sketch,
            ], capture=True)
        except subprocess.CalledProcessError as error:
            # Retain the actual failure log without making a publishable bundle.
            (WORK / ("candidate-compile.log" if candidate is not None else "baseline-compile.log")).write_text(error.stdout or "")
            # Compiler diagnostics can quote generated source. Keep Actions commands disabled.
            token = uuid.uuid4().hex
            if os.environ.get("GITHUB_ACTIONS") == "true":
                print(f"::stop-commands::{token}", flush=True)
            print((error.stdout or "")[-16000:], flush=True)
            if os.environ.get("GITHUB_ACTIONS") == "true":
                print(f"::{token}::", flush=True)
            raise
        (WORK / ("candidate-compile.log" if candidate is not None else "baseline-compile.log")).write_text(compile_log)
        application = export / "LightboardBaseline.ino.bin"
        if not application.is_file() or not 0 < application.stat().st_size <= lock["application_slot_bytes"]:
            raise ValueError("Missing application image or image exceeds the pinned OTA slot size")
        pending = temporary / "artifact"
        pending.mkdir()
        for suffix in ("bin", "bootloader.bin", "partitions.bin"):
            filename = f"LightboardBaseline.ino.{suffix}"
            shutil.copyfile(export / filename, pending / filename)
        binaries = {p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(pending.iterdir())}
        report = {
            "built_at_utc": datetime.now(timezone.utc).isoformat(),
            "commit": os.environ.get("GITHUB_SHA"),
            "source_sha256": sha256(sketch / "LightboardBaseline.ino"),
            "build_lock_sha256": sha256(ROOT / "build-lock.json"),
            "arduino_cli": lock["arduino_cli_version"],
            "core": f"{lock['core']}@{lock['core_version']}",
            "libraries": lock["libraries"],
            "fqbn": lock["fqbn"],
            "application_slot_bytes": lock["application_slot_bytes"],
            "application_headroom_bytes": lock["application_slot_bytes"] - application.stat().st_size,
            "binaries": binaries,
            "uploaded_to_board": False,
            "ota_enabled": False,
            "model_api_used": generation is not None,
        }
        static_dram = re.search(r"Global variables use ([\d,]+) bytes", compile_log)
        if static_dram:
            report["static_dram_bytes_reported"] = int(static_dram[1].replace(",", ""))
        if candidate is not None:
            report.update(
                build_mode="restState candidate",
                baseline_source_sha256=lock["baseline"]["source_sha256"],
                protected_sha256=lock["baseline"]["protected_sha256"],
                candidate_sha256=digest(candidate.encode()),
                creative_review_required=False,
                published=False,
                run_id=os.environ.get("GITHUB_RUN_ID"),
                run_attempt=os.environ.get("GITHUB_RUN_ATTEMPT"),
            )
            (pending / "restState.cpp").write_text(candidate + "\n")
            (pending / "LightboardBaseline.ino").write_text(updated)
            (pending / "compile.log").write_text(compile_log)
            if generation:
                report["model"] = generation["model"]
                report["generation_response_sha256"] = generation["response_sha256"]
                (pending / "generation.json").write_text(json.dumps(generation, indent=2) + "\n")
            manifest = {
                "schema_version": 1,
                "version": "candidate-" + report["source_sha256"][:16],
                "firmware": {
                    "filename": application.name,
                    "sha256": binaries[application.name]["sha256"],
                    "bytes": application.stat().st_size,
                },
                "source_sha256": report["source_sha256"],
                "fqbn": lock["fqbn"],
                "ota_enabled": False,
                "published": False,
            }
            (pending / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (pending / "build-report.json").write_text(json.dumps(report, indent=2) + "\n")
        (pending / "SHA256SUMS").write_text("".join(
            f"{sha256(p)}  {p.name}\n" for p in sorted(pending.iterdir())
        ))
        # No bundle is eligible unless the original pinned files still match.
        verify(lock)
        pending.rename(artifact)
    print(f"Build passed. Application: {binaries['LightboardBaseline.ino.bin']['bytes']} bytes.")
    print(f"Firmware and checksums: {artifact}")
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as summary:
            summary.write(
                ("## Lightboard candidate compiled\n\n" if candidate is not None else "## Lightboard baseline compiled\n\n") +
                f"Application: {binaries['LightboardBaseline.ino.bin']['bytes']:,} bytes.\n\n"
                "Compiled against the pinned foundation; no device upload. "
                "Download storage is optional and disabled by default.\n"
            )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, TypeError, KeyError, subprocess.CalledProcessError) as error:
        print(f"Build stopped: {error}", file=sys.stderr)
        sys.exit(1)
