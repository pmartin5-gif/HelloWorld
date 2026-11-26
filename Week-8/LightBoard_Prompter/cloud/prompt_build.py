#!/usr/bin/env python3
"""Build a recorded prompt response with the sealed OTA foundation, without generation or delivery."""
import argparse
import json
import os
from pathlib import Path
import sys
import subprocess

if __package__:
    from . import ota_build, ota_publish, scene
else:
    import ota_build
    import ota_publish
    import scene


def prepare(work, record, prompt, brief, cli, data_dir, run, attempt):
    work = work.resolve()
    ota_build.require((ota_build.PROJECT / ".build").resolve() in work.parents,
                      "Use a new directory inside this project's .build")
    ota_build.require(not work.exists(), "Prompt work directory already exists; preserve it and choose another")
    data, function = scene.load_generation(record)
    ota_build.require(data.get("creative_prompt") == prompt.read_text().strip(),
                      "Generation belongs to a different prompt")
    ota_build.require(data.get("brief_sha256") == scene.digest(brief.read_bytes()),
                      "Generation belongs to a different brief")
    ota_build.generation_source(record)  # Verify origin, function and foundation before any build.
    ota_publish.tag_name(run, attempt)
    work.mkdir(parents=True)
    frozen = work / "generation.json"
    frozen.write_text(json.dumps(data, indent=2) + "\n")
    ota_build.compile_pilot(work / "baseline", cli, data_dir)
    ota_build.compile_pilot(work / "candidate", cli, data_dir, function, generation_record=frozen)
    manifest = ota_publish.prepare(work / "candidate/artifact", work / "baseline/artifact",
                                   work / "package", "generated", run, attempt)
    ota_build.require(manifest["published"] is False and manifest["automatic_updates"] is False,
                      "Preparation must not enable delivery")
    print("PROMPT_OTA_PREPARED: " + json.dumps({
        "foundation_id": manifest["foundation_id"], "current": manifest["current"],
        "generation": manifest["generation"], "published": False,
        "automatic_updates": False, "device_command_sent": False}))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--generation-record", type=Path, required=True)
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--brief", type=Path, default=ota_build.PROJECT / "generationBrief.md")
    parser.add_argument("--cli", type=Path, default=Path('/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli'))
    parser.add_argument("--data-dir", type=Path, default=Path.home() / "Library/Arduino15")
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID"))
    parser.add_argument("--attempt", default=os.environ.get("GITHUB_RUN_ATTEMPT", "1"))
    args = parser.parse_args()
    prepare(args.work, args.generation_record, args.prompt_file, args.brief,
            args.cli, args.data_dir, args.run_id, args.attempt)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print("STOP: " + (str(error) if type(error) is ValueError else type(error).__name__), file=sys.stderr)
        sys.exit(1)
