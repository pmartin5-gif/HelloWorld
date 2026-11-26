#!/usr/bin/env python3
"""Publish validated scenes for the sealed OTA foundation; never command a device."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import sys

if __package__:
    from . import build, ota_build, publish as delivery, scene
else:
    import build
    import ota_build
    import publish as delivery
    import scene

require, encoded, sha = delivery.require, delivery.encoded, delivery.sha
ASSETS = delivery.ASSETS
APP = "LightboardOTA.ino.bin"
RECOVERY_SCOPE = "Application only; preserve matching bootloader/partitions and IDE recovery source"
RECORD = ota_build.PROJECT / "experiments/flash-lite/2026-11-09/cloud-run-42735010470/generation.json"
# Exact current automatic feed -> fresh-feed/reporting runtime. Bootstrap this runtime
# once through Arduino IDE; the old runtime correctly rejects a new foundation.
PRIOR_FOUNDATION = "a529d5f9a72ca4858e0ab09ae66ec5eaecff656fdeb6d6a4f040e40633959ec1"
TRANSITION_FOUNDATION = "65386614eb48384defc7091f1cd5f12b5b6d11feb4f6c9f3186d87ad098a094e"
PRIOR_MANIFEST_SHA256 = "489e2fb47993314fbd21b82ac05eb88951108a4db0787bea7f9e63365e69af37"


def superseded_reference():
    return {"foundation_id": PRIOR_FOUNDATION,
            "manifest_url": asset_url("lightboard-ota-45910268762-1", "manifest.json"),
            "manifest_sha256": PRIOR_MANIFEST_SHA256, "compatible_for_ota": False}


def validate_foundation_transition(prior):
    _, _, foundation, _, _ = known_source("baseline")
    require(foundation == TRANSITION_FOUNDATION and prior.get("foundation_id") == PRIOR_FOUNDATION and
            sha(encoded(prior)) == PRIOR_MANIFEST_SHA256,
            "Unsupported prior OTA manifest/foundation transition; review exact history before publishing")


def known_source(name):
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    build.verify(lock)
    baseline, foundation = ota_build.verify_foundation(lock)
    require(name in ("baseline", "saved-heart"), "Only controlled known scenes are allowed")
    generation = None
    source = baseline
    if name == "saved-heart":
        record, function = scene.load_generation(RECORD)
        source = scene.compose(baseline, function, scene.protected_hash(baseline))
        generation = {"run_id": record["run_id"], "response_sha256": record["response_sha256"],
                      "model_request_in_this_run": False}
    version = "ota-pilot-" + scene.digest((foundation + "\0" + source).encode())[:24]
    return lock, source, foundation, version, generation


def validate_image_identity(data, foundation, version):
    require(all(b"\0" + value.encode() + b"\0" in data for value in (foundation, version)),
            "OTA binary does not contain the expected sealed identity")


def checked_bundle(folder, name):
    if name == "generated":
        lock, source, foundation, version, record, _ = ota_build.generation_source(folder / "generation.json")
        requested = record["run_id"] == os.environ.get("GITHUB_RUN_ID")
        generation = ota_build.generation_metadata(record, requested)
    else:
        lock, source, foundation, version, generation = known_source(name)
        requested = False
    inputs = {"LightboardOTA.ino", "partitions.csv", "BuildIdentity.h", *ota_build.RUNTIME_FILES}
    binaries = {APP, "LightboardOTA.ino.bootloader.bin", "LightboardOTA.ino.partitions.bin"}
    expected = inputs | binaries | {"manifest.json", "build-report.json", "SHA256SUMS"}
    if name == "generated":
        expected.add("generation.json")
    require(not folder.is_symlink() and {p.name for p in folder.iterdir()} == expected,
            "Incomplete or unexpected OTA bundle inventory")
    sums = {}
    for line in (folder / "SHA256SUMS").read_text().splitlines():
        digest, filename = line.split("  ", 1)
        require(filename in expected - {"SHA256SUMS"} and filename not in sums and
                re.fullmatch(r"[a-f0-9]{64}", digest), "Invalid OTA checksum entry")
        sums[filename] = digest
    require(set(sums) == expected - {"SHA256SUMS"}, "Incomplete OTA checksums")
    for filename in expected:
        path = folder / filename
        require(path.is_file() and not path.is_symlink(), "Non-file or symlink in OTA bundle")
        if filename != "SHA256SUMS":
            require(sha(path.read_bytes()) == sums[filename], "OTA bundle checksum mismatch")
    require((folder / "LightboardOTA.ino").read_bytes() == source.encode(), "Validated OTA scene source mismatch")
    for filename in ota_build.RUNTIME_FILES:
        require((folder / filename).read_bytes() == (ota_build.DEVICE / "runtime" / filename).read_bytes(),
                "OTA runtime source mismatch")
    identity = f'#pragma once\n#define LB_FOUNDATION_ID "{foundation}"\n#define LB_FIRMWARE_VERSION "{version}"\n'
    require((folder / "BuildIdentity.h").read_bytes() == identity.encode() and
            (folder / "partitions.csv").read_bytes() == (build.ROOT / lock["sketch"] / "partitions.csv").read_bytes(),
            "OTA identity or partition mismatch")
    report = json.loads((folder / "build-report.json").read_text())
    require(report["build_lock_sha256"] == build.sha256(build.ROOT / "build-lock.json") and
            report["foundation_lock_sha256"] == build.sha256(ota_build.DEVICE / "foundation-lock.json") and
            report["foundation_id"] == foundation and report["firmware_version"] == version and
            report["source_sha256"] == sha(source.encode()) and
            report["ota_protected_sha256"] == scene.protected_hash(source) and
            report["baseline_source_sha256"] == lock["baseline"]["source_sha256"] and
            report["fqbn"] == lock["fqbn"] and report["arduino_cli"] == lock["arduino_cli_version"] and
            report["core"] == f"{lock['core']}@{lock['core_version']}" and
            type(report["model_requests"]) is int and report["model_requests"] == int(requested) and
            report["uploaded_to_board"] is False and report["automatic_updates"] is False and
            report["application_slot_bytes"] == lock["application_slot_bytes"], "Unsupported OTA build report")
    if name == "generated":
        require(report.get("generation") == generation, "Generated OTA provenance mismatch")
    for filename in binaries:
        data = (folder / filename).read_bytes()
        require(report["binaries"][filename] == {"bytes": len(data), "sha256": sha(data)},
                "OTA binary/report mismatch")
    data = (folder / APP).read_bytes()
    validate_image_identity(data, foundation, version)
    require(data[:1] == b"\xe9" and 288 <= len(data) <= lock["application_slot_bytes"] and
            report["application_headroom_bytes"] == lock["application_slot_bytes"] - len(data),
            "Invalid OTA application size/image")
    local = json.loads((folder / "manifest.json").read_text())
    require(local["published"] is False and local["ota_enabled"] is True and local["schema_version"] == 2 and
            local["foundation_id"] == foundation and local["current"]["version"] == version and
            local["current"]["sha256"] == sha(data) and local["current"]["bytes"] == len(data),
            "OTA local manifest mismatch")
    return report, data, generation


def tag_name(run, attempt):
    return delivery.tag_name(run, attempt).replace("lightboard-test-", "lightboard-ota-", 1)


def asset_url(tag, filename):
    require(re.fullmatch(r"lightboard-ota-[1-9][0-9]*-[1-9][0-9]*", tag) and filename in ASSETS,
            "Invalid OTA release asset URL")
    return f"https://github.com/{delivery.REPOSITORY}/releases/download/{tag}/{filename}"


def entry(report, data, tag, filename):
    return {"version": report["firmware_version"], "release_tag": tag, "url": asset_url(tag, filename),
            "bytes": len(data), "sha256": sha(data), "source_sha256": report["source_sha256"]}


def validate_entry(value, filename="firmware.bin"):
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    require(isinstance(value, dict) and set(value) == {"version", "release_tag", "url", "bytes", "sha256", "source_sha256"}
            and re.fullmatch(r"ota-pilot-[a-f0-9]{24}", value.get("version", "")) and
            type(value.get("bytes")) is int and 288 <= value["bytes"] <= lock["application_slot_bytes"] and
            re.fullmatch(r"[a-f0-9]{64}", value.get("sha256", "")) and
            re.fullmatch(r"[a-f0-9]{64}", value.get("source_sha256", "")) and
            value.get("url") == asset_url(value.get("release_tag", ""), filename), "Invalid OTA firmware metadata")


def validate_manifest(m, published):
    if m.get("scene") == "generated":
        # Historical records have no public prompt/source. Exact composition is checked
        # against generation.json at prepare time; history retains immutable asset hashes.
        lock, _, foundation, _, _ = known_source("baseline")
        generation = m.get("generation")
        require(isinstance(generation, dict) and
                set(generation) == {"run_id", "response_sha256", "model_request_in_this_run"} and
                isinstance(generation["run_id"], str) and re.fullmatch(r"[1-9][0-9]*", generation["run_id"]) and
                isinstance(generation["response_sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", generation["response_sha256"]) and
                type(generation["model_request_in_this_run"]) is bool,
                "Unsupported generated OTA provenance")
        require(generation["model_request_in_this_run"] is (generation["run_id"] == m["build"]["run_id"]),
                "Generation/build run mismatch")
    else:
        lock, source, foundation, version, generation = known_source(m.get("scene"))
        require(m["current"]["version"] == version and
                m["current"]["source_sha256"] == sha(source.encode()), "Known OTA source identity mismatch")
    require(set(m) == {"schema_version", "repository", "channel", "device", "foundation_id", "fqbn",
                       "ota_enabled", "published", "automatic_updates", "scene", "generation", "build",
                       "current", "usb_recovery", "usb_recovery_scope", "previous", "legacy_delivery_test",
                       "superseded_ota"} and
            m["schema_version"] == 2 and m["repository"] == delivery.REPOSITORY and
            m["channel"] == "ota-pilot" and m["device"] == "esp32-32x32" and
            m["foundation_id"] == foundation and m["fqbn"] == lock["fqbn"] and
            m["published"] is published and m["ota_enabled"] is True and type(m["automatic_updates"]) is bool and
            m["usb_recovery_scope"] == RECOVERY_SCOPE and
            m["generation"] == generation and set(m["build"]) == {"run_id", "attempt", "commit_sha"} and
            ((m["build"]["commit_sha"] is None and published is False) or
             re.fullmatch(r"[a-f0-9]{40}", m["build"]["commit_sha"])),
            "Unsupported OTA publication manifest")
    validate_entry(m["current"])
    validate_entry(m["usb_recovery"], "recovery.bin")
    tag = tag_name(m["build"]["run_id"], m["build"]["attempt"])
    require(m["current"]["release_tag"] == tag and m["usb_recovery"]["release_tag"] == tag,
            "Manifest build/tag mismatch")
    _, baseline, _, baseline_version, _ = known_source("baseline")
    require(m["usb_recovery"]["version"] == baseline_version and
            m["usb_recovery"]["source_sha256"] == sha(baseline.encode()), "Recovery must retain the sealed baseline pilot")
    if m["previous"] is not None:
        validate_entry(m["previous"])
    require(m["superseded_ota"] is None or m["superseded_ota"] == superseded_reference(),
            "Unsupported superseded OTA history")
    require(len(encoded(m)) <= 8192, "OTA manifest exceeds device bound")
    pending = [(m, 1)]
    while pending:
        value, depth = pending.pop()
        require(depth <= 12, "OTA manifest exceeds device nesting bound")
        children = value.values() if isinstance(value, dict) else value
        pending.extend((child, depth + 1) for child in children if isinstance(child, (dict, list)))


def write_manifest(folder, manifest):
    (folder / "manifest.json").write_bytes(encoded(manifest))
    (folder / "SHA256SUMS").write_text("".join(f"{sha((folder / n).read_bytes())}  {n}\n" for n in ASSETS[:-1]))


def prepare(candidate, baseline, output, name, run, attempt, automatic_updates=False):
    require(not output.exists(), "OTA publication output already exists")
    report, binary, generation = checked_bundle(candidate, name)
    recovery_report, recovery, _ = checked_bundle(baseline, "baseline")
    tag = tag_name(run, attempt)
    manifest = {"schema_version": 2, "repository": delivery.REPOSITORY, "channel": "ota-pilot",
        "device": "esp32-32x32", "foundation_id": report["foundation_id"], "fqbn": report["fqbn"],
        "ota_enabled": True, "published": False, "automatic_updates": automatic_updates, "scene": name,
        "generation": generation, "build": {"run_id": str(run), "attempt": str(attempt),
                                           "commit_sha": os.environ.get("GITHUB_SHA")},
        "current": entry(report, binary, tag, "firmware.bin"),
        "usb_recovery": entry(recovery_report, recovery, tag, "recovery.bin"),
        "usb_recovery_scope": RECOVERY_SCOPE,
        "previous": None, "legacy_delivery_test": None, "superseded_ota": None}
    validate_manifest(manifest, False)
    output.mkdir(parents=True)
    (output / "firmware.bin").write_bytes(binary)
    (output / "recovery.bin").write_bytes(recovery)
    write_manifest(output, manifest)
    return manifest


def read_channel(api):
    require(api.request("GET", f"/git/ref/heads/{delivery.BRANCH}") is not None,
            "Existing Step 6 feed is required; refusing to initialize a different channel")
    file = api.request("GET", f"/contents/manifest.json?ref={delivery.BRANCH}")
    require(file and file.get("encoding") == "base64" and file.get("type") == "file" and
            type(file.get("size")) is int and file["size"] <= 8192, "Invalid existing OTA feed file")
    raw = base64.b64decode(file["content"])
    require(len(raw) == file["size"] and len(raw) <= 8192, "Existing feed content exceeds bound")
    data = json.loads(raw)
    if data.get("schema_version") == 1:
        lock = json.loads((build.ROOT / "build-lock.json").read_text())
        require(data.get("repository") == delivery.REPOSITORY and data.get("channel") == "delivery-test" and
                data.get("ota_enabled") is False and data.get("fqbn") == lock["fqbn"], "Unsupported legacy feed")
        for key in ("current", "previous", "usb_recovery"):
            delivery.validate_entry(data[key], lock["application_slot_bytes"])
    elif data.get("foundation_id") == PRIOR_FOUNDATION:
        validate_foundation_transition(data)
    else:
        validate_manifest(data, True)
    return data, file["sha"]


def publish(folder, api, download=delivery.public_bytes):
    require(not folder.is_symlink() and {p.name for p in folder.iterdir()} == set(ASSETS) and
            all(p.is_file() and not p.is_symlink() for p in folder.iterdir()), "Unexpected OTA publication files")
    m = json.loads((folder / "manifest.json").read_text())
    validate_manifest(m, False)
    require(m["previous"] is None and m["legacy_delivery_test"] is None and m["superseded_ota"] is None,
            "Prepared channel history must be empty")
    for filename, key in (("firmware.bin", "current"), ("recovery.bin", "usb_recovery")):
        data = (folder / filename).read_bytes()
        require(data[:1] == b"\xe9" and len(data) == m[key]["bytes"] and sha(data) == m[key]["sha256"],
                "Prepared OTA binary changed")
        validate_image_identity(data, m["foundation_id"], m[key]["version"])
    sums = "".join(f"{sha((folder / n).read_bytes())}  {n}\n" for n in ASSETS[:-1])
    require((folder / "SHA256SUMS").read_text() == sums, "Prepared OTA checksums changed")
    require(os.environ.get("GITHUB_REPOSITORY") == delivery.REPOSITORY and
            os.environ.get("GITHUB_REF") == "refs/heads/main" and
            re.fullmatch(r"[a-f0-9]{40}", os.environ.get("GITHUB_SHA", "")) and
            os.environ.get("GITHUB_SHA") == m["build"]["commit_sha"] and
            os.environ.get("GITHUB_RUN_ID") == m["build"]["run_id"] and
            os.environ.get("GITHUB_RUN_ATTEMPT") == m["build"]["attempt"], "Matching main-branch Actions run required")
    repo = api.request("GET", "")
    require(repo and repo.get("private") is False, "Public repository required")
    require(api.request("GET", "/git/ref/heads/main")["object"]["sha"] == os.environ["GITHUB_SHA"], "Main moved")
    prior, blob = read_channel(api)
    tag = tag_name(m["build"]["run_id"], m["build"]["attempt"])
    require(m["current"]["release_tag"] == tag and m["usb_recovery"]["release_tag"] == tag, "Run/tag mismatch")
    require(api.request("GET", f"/releases/tags/{tag}") is None and
            api.request("GET", f"/git/ref/tags/{tag}") is None, "OTA release/tag already exists; never overwrite")
    if prior["schema_version"] == 1:
        m["legacy_delivery_test"] = prior  # Preserve full legacy metadata and all immutable release assets.
        for key in ("current", "previous", "usb_recovery"):
            delivery.verify_download(prior[key], download)
    elif prior["foundation_id"] == m["foundation_id"]:
        m["previous"] = prior["current"]
        m["legacy_delivery_test"] = prior["legacy_delivery_test"]
        m["superseded_ota"] = prior["superseded_ota"]
        delivery.verify_download(m["previous"], download)
    else:
        validate_foundation_transition(prior)
        # Preserve the immutable old manifest as history, never as a compatible rollback entry.
        reference = superseded_reference()
        require(download(reference["manifest_url"], 8192) == encoded(prior),
                "Prior OTA manifest anonymous readback mismatch; feed unchanged")
        for key in ("current", "usb_recovery"):
            delivery.verify_download(prior[key], download)
        m["legacy_delivery_test"] = prior["legacy_delivery_test"]
        m["superseded_ota"] = reference
        print("OTA_FOUNDATION_TRANSITION: verified exact prior manifest; previous compatible image is empty")
    m["published"] = True
    validate_manifest(m, True)
    write_manifest(folder, m)
    release = api.request("POST", "/releases", {"tag_name": tag, "target_commitish": os.environ["GITHUB_SHA"],
        "name": f"Lightboard OTA pilot {m['build']['run_id']}: {m['scene']}",
        "body": "Validated Lightboard OTA package. Automatic eligibility: " + str(m["automatic_updates"]) + ". "
                "Installation also requires the board's saved auto-on setting. "
                "Retains sealed Wi-Fi/update foundation. Recovery asset is an application only. "
                "Physical installation and rollback checks are separate; preserve USB recovery source.",
        "draft": True, "prerelease": True, "make_latest": "false"})
    require(release and type(release.get("id")) is int, "Release creation returned no ID")
    for filename in ASSETS:
        data = (folder / filename).read_bytes()
        uploaded = api.request("POST", f"/releases/{release['id']}/assets?name={filename}", binary=data)
        require(uploaded.get("name") == filename and uploaded.get("state") == "uploaded" and
                uploaded.get("size") == len(data) and uploaded.get("digest") == "sha256:" + sha(data),
                "OTA asset upload verification failed; feed unchanged")
    api.request("PATCH", f"/releases/{release['id']}", {"draft": False, "prerelease": True, "make_latest": "false"})
    for filename in ASSETS:
        data = (folder / filename).read_bytes()
        require(download(asset_url(tag, filename), len(data)) == data, "Anonymous OTA readback mismatch; feed unchanged")
    require(api.request("GET", "/git/ref/heads/main")["object"]["sha"] == os.environ["GITHUB_SHA"], "Main moved before feed update")
    result = api.request("PUT", "/contents/manifest.json", {"message": f"Publish controlled OTA feed {tag}",
        "branch": delivery.BRANCH, "sha": blob, "content": base64.b64encode(encoded(m)).decode()})
    commit = result["commit"]["sha"]
    for url in (f"https://raw.githubusercontent.com/{delivery.REPOSITORY}/{commit}/manifest.json", delivery.FEED_URL):
        require(download(url, 8192) == encoded(m), "OTA feed committed but readback failed; inspect before retrying")
    print(f"OTA_PUBLICATION_PASSED: https://github.com/{delivery.REPOSITORY}/releases/tag/{tag}")
    print("Publication sends no model request or device command; board installation is not acknowledged by this result.")
    return m


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--scene", choices=("saved-heart", "baseline", "generated"), default="saved-heart")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID"))
    parser.add_argument("--attempt", default=os.environ.get("GITHUB_RUN_ATTEMPT", "1"))
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    if args.publish:
        require(not args.candidate and not args.baseline, "Publish an already prepared package")
        publish(args.output, delivery.GitHub(os.environ.get("GH_TOKEN")))
    else:
        require(args.candidate and args.baseline, "Candidate and baseline bundles required")
        prepare(args.candidate, args.baseline, args.output, args.scene, args.run_id, args.attempt)
        print("OTA_PUBLICATION_PREPARED: no network request or device operation")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print("STOP: " + (str(error) if type(error) is ValueError else type(error).__name__), file=sys.stderr)
        sys.exit(1)
