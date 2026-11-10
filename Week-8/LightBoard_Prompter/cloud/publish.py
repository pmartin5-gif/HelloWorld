#!/usr/bin/env python3
"""Prepare or publish the non-OTA Lightboard delivery test. Never access a device."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

if __package__:
    from . import build, scene
else:
    import build
    import scene

REPOSITORY = "pmartin5-gif/HelloWorld"
BRANCH = "lightboard-feed"
FEED_PATH = "manifest.json"
FEED_URL = f"https://raw.githubusercontent.com/{REPOSITORY}/{BRANCH}/{FEED_PATH}"
API = f"https://api.github.com/repos/{REPOSITORY}"
APP = "LightboardBaseline.ino.bin"
ASSETS = ("firmware.bin", "recovery.bin", "manifest.json", "SHA256SUMS")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tag_name(run_id, attempt):
    require(re.fullmatch(r"[1-9][0-9]*", str(run_id)) and
            re.fullmatch(r"[1-9][0-9]*", str(attempt)), "Invalid run ID or attempt")
    return f"lightboard-test-{run_id}-{attempt}"


def asset_url(tag, name):
    require(re.fullmatch(r"lightboard-test-[1-9][0-9]*-[1-9][0-9]*", tag), "Invalid Lightboard tag")
    require(name in ASSETS, "Unexpected release asset")
    return f"https://github.com/{REPOSITORY}/releases/download/{tag}/{name}"


def checked_bundle(folder, lock, candidate):
    """Bind every listed file, report, source, response, and binary to the locked build."""
    require(not folder.is_symlink(), "Symlink bundle")
    sums = {}
    for line in (folder / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split("  ", 1)
        require(re.fullmatch(r"[a-f0-9]{64}", digest) and
                re.fullmatch(r"[A-Za-z0-9_.-]+", name) and name not in sums,
                "Invalid checksum entry")
        sums[name] = digest
    files = {p.name for p in folder.iterdir()}
    require(files == set(sums) | {"SHA256SUMS"}, "Incomplete or unexpected bundle inventory")
    for name, digest in sums.items():
        p = folder / name
        require(p.is_file() and not p.is_symlink() and sha(p.read_bytes()) == digest,
                "Bundle checksum mismatch")
    report = json.loads((folder / "build-report.json").read_text())
    require(report["build_lock_sha256"] == build.sha256(build.ROOT / "build-lock.json") and
            report["fqbn"] == lock["fqbn"] and
            report["arduino_cli"] == lock["arduino_cli_version"] and
            report["core"] == f"{lock['core']}@{lock['core_version']}" and
            report["libraries"] == lock["libraries"] and
            report["application_slot_bytes"] == lock["application_slot_bytes"] and
            report["ota_enabled"] is False and report["uploaded_to_board"] is False,
            "Unsupported build report or OTA foundation")
    binary = (folder / APP).read_bytes()
    require(binary[:1] == b"\xe9" and 0 < len(binary) <= lock["application_slot_bytes"],
            "Invalid or oversized ESP32 application")
    require(report["binaries"][APP] == {"bytes": len(binary), "sha256": sha(binary)},
            "Application does not match build report")
    require(report["application_headroom_bytes"] == lock["application_slot_bytes"] - len(binary),
            "Inconsistent slot headroom")
    baseline = (build.ROOT / lock["sketch"] / "LightboardBaseline.ino").read_text()
    if candidate:
        record, function = scene.load_generation(folder / "generation.json")
        source = (folder / "LightboardBaseline.ino").read_text()
        expected = scene.compose(baseline, function, lock["baseline"]["protected_sha256"])
        require(source == expected and report["source_sha256"] == sha(source.encode()) and
                report["protected_sha256"] == lock["baseline"]["protected_sha256"] and
                report["candidate_sha256"] == sha(function.encode()) and
                report["generation_response_sha256"] == record["response_sha256"] and
                report["generation_run_id"] == record["run_id"] and
                report["model_request_in_this_run"] is False,
                "Candidate source or saved-generation provenance mismatch")
    else:
        require(report["source_sha256"] == lock["baseline"]["source_sha256"] and
                report["model_api_used"] is False, "Recovery must be the pinned baseline")
    return report, binary


def entry(report, binary, tag, filename, role):
    return {
        "version": f"{role}-{report['source_sha256'][:16]}-{sha(binary)[:16]}",
        "release_tag": tag, "url": asset_url(tag, filename),
        "sha256": sha(binary), "bytes": len(binary),
        "source_sha256": report["source_sha256"], "ota_enabled": False,
    }


def prepare(candidate, baseline, output, run_id, attempt):
    """Only allowlist delivery files; source, prompts, credentials, and logs stay local."""
    require(not output.exists(), "Publication output already exists; choose a fresh directory")
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    build.verify(lock)
    report, binary = checked_bundle(candidate, lock, True)
    recovery_report, recovery = checked_bundle(baseline, lock, False)
    tag = tag_name(run_id, attempt)
    manifest = {
        "schema_version": 1, "repository": REPOSITORY, "channel": "delivery-test",
        "fqbn": lock["fqbn"], "ota_enabled": False,
        "current": entry(report, binary, tag, "firmware.bin", "candidate"),
        "usb_recovery": entry(recovery_report, recovery, tag, "recovery.bin", "baseline"),
        "generation": {"run_id": report["generation_run_id"],
                       "response_sha256": report["generation_response_sha256"],
                       "model_request_in_this_run": False},
        "build": {"run_id": str(run_id), "attempt": str(attempt)},
    }
    output.mkdir(parents=True)
    (output / "firmware.bin").write_bytes(binary)
    (output / "recovery.bin").write_bytes(recovery)
    (output / "manifest.json").write_bytes(encoded(manifest))
    (output / "SHA256SUMS").write_text("".join(
        f"{sha((output / name).read_bytes())}  {name}\n" for name in ASSETS[:-1]))
    return manifest


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Authenticated GitHub API redirect refused")


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        require(parsed.scheme == "https" and parsed.hostname in {
            "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com",
            "raw.githubusercontent.com"} and not parsed.username and not parsed.password and
            parsed.port in (None, 443), "Untrusted public download redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def public_bytes(url, maximum):
    opener = urllib.request.build_opener(PublicRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": "Lightboard-delivery-test"})
    with opener.open(request, timeout=30) as response:
        require(response.status == 200, "Public download failed")
        data = response.read(maximum + 1)
    require(len(data) <= maximum, "Public response exceeds expected size")
    return data


class GitHub:
    def __init__(self, token):
        require(bool(token), "Missing Actions publication token")
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, data=None, binary=None):
        url = API + path
        if binary is not None:
            require(re.fullmatch(r"/releases/[0-9]+/assets\?name=(?:firmware\.bin|recovery\.bin|manifest\.json|SHA256SUMS)", path),
                    "Unexpected asset upload path")
            url = f"https://uploads.github.com/repos/{REPOSITORY}" + path
        body = binary if binary is not None else (encoded(data) if data is not None else None)
        request = urllib.request.Request(url, data=body, method=method, headers={
            "Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Lightboard-delivery-test",
            "Content-Type": "application/octet-stream" if binary is not None else "application/json",
        })
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.loads(response.read(2 * 1024 * 1024))
        except urllib.error.HTTPError as error:
            if error.code == 404 and method == "GET":
                return None
            # Do not print request objects, signed URLs, server bodies, or credentials.
            raise ValueError(f"GitHub {method} stopped with HTTP {error.code}; no automatic retry") from None


def validate_entry(value, fqbn_slot):
    require(isinstance(value, dict), "Missing firmware entry")
    require(set(value) == {"version", "release_tag", "url", "sha256", "bytes", "source_sha256", "ota_enabled"}
            and re.fullmatch(r"(?:candidate|baseline)-[a-f0-9]{16}-[a-f0-9]{16}", value.get("version", ""))
            and value.get("ota_enabled") is False and type(value.get("bytes")) is int and
            0 < value["bytes"] <= fqbn_slot and
            re.fullmatch(r"[a-f0-9]{64}", value.get("sha256", "")) and
            re.fullmatch(r"[a-f0-9]{64}", value.get("source_sha256", "")), "Invalid firmware metadata")
    tag = value["release_tag"]
    require(value["url"] in (asset_url(tag, "firmware.bin"), asset_url(tag, "recovery.bin")),
            "Firmware URL is outside this Lightboard release")


def read_channel(api):
    branch = api.request("GET", f"/git/ref/heads/{BRANCH}")
    if branch is None:
        return None, None
    file = api.request("GET", f"/contents/{FEED_PATH}?ref={BRANCH}")
    require(file and file.get("encoding") == "base64" and file.get("type") == "file" and
            type(file.get("size")) is int and file["size"] <= 32768,
            "Existing feed branch has no valid manifest; refusing replacement")
    data = json.loads(base64.b64decode(file["content"], validate=False))
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    require(data.get("schema_version") == 1 and data.get("repository") == REPOSITORY and
            data.get("channel") == "delivery-test" and data.get("fqbn") == lock["fqbn"] and
            data.get("ota_enabled") is False, "Unsupported existing feed")
    validate_entry(data["current"], lock["application_slot_bytes"])
    validate_entry(data["previous"], lock["application_slot_bytes"])
    return data, file["sha"]


def verify_download(value, download):
    data = download(value["url"], value["bytes"])
    require(len(data) == value["bytes"] and sha(data) == value["sha256"],
            "Anonymous firmware download failed checksum verification")


def publish(folder, api, download=public_bytes):
    """Publish complete assets first, then switch a single small feed file atomically."""
    require({p.name for p in folder.iterdir()} == set(ASSETS) and
            all(p.is_file() and not p.is_symlink() for p in folder.iterdir()),
            "Unexpected publication files")
    manifest = json.loads((folder / "manifest.json").read_text())
    lock = json.loads((build.ROOT / "build-lock.json").read_text())
    require(set(manifest) == {"schema_version", "repository", "channel", "fqbn", "ota_enabled",
                             "current", "usb_recovery", "generation", "build"} and
            set(manifest["generation"]) == {"run_id", "response_sha256", "model_request_in_this_run"} and
            set(manifest["build"]) == {"run_id", "attempt"} and
            manifest.get("repository") == REPOSITORY and manifest.get("schema_version") == 1 and
            manifest.get("channel") == "delivery-test" and manifest.get("ota_enabled") is False and
            manifest.get("fqbn") == lock["fqbn"] and
            manifest["generation"]["model_request_in_this_run"] is False,
            "Unsupported publication manifest")
    for name, key in (("firmware.bin", "current"), ("recovery.bin", "usb_recovery")):
        validate_entry(manifest[key], lock["application_slot_bytes"])
        data = (folder / name).read_bytes()
        require(sha(data) == manifest[key]["sha256"] and len(data) == manifest[key]["bytes"],
                "Prepared binary changed")
    expected_sums = "".join(f"{sha((folder / n).read_bytes())}  {n}\n" for n in ASSETS[:-1])
    require((folder / "SHA256SUMS").read_text() == expected_sums, "Publication checksums changed")
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY and
            os.environ.get("GITHUB_REF") == "refs/heads/main" and
            re.fullmatch(r"[a-f0-9]{40}", os.environ.get("GITHUB_SHA", "")) and
            os.environ.get("GITHUB_RUN_ID") == manifest["build"]["run_id"] and
            os.environ.get("GITHUB_RUN_ATTEMPT") == manifest["build"]["attempt"],
            "Publication requires the matching main-branch Actions run")
    repo = api.request("GET", "")
    require(repo and repo.get("private") is False, "Public repository required")
    require(api.request("GET", f"/git/ref/heads/main")["object"]["sha"] == os.environ["GITHUB_SHA"],
            "Main changed after checkout; refusing publication of an outdated workflow revision")
    previous, previous_sha = read_channel(api)
    tag = tag_name(manifest["build"]["run_id"], manifest["build"]["attempt"])
    require(manifest["current"]["release_tag"] == tag and manifest["usb_recovery"]["release_tag"] == tag,
            "Release tag does not match run")
    require(api.request("GET", f"/releases/tags/{tag}") is None, "Release already exists; refusing overwrite")
    require(api.request("GET", f"/git/ref/tags/{tag}") is None, "Release tag already exists; refusing reuse")
    manifest["previous"] = previous["current"] if previous else manifest["usb_recovery"]
    manifest["previous_role"] = "previous publication; physical approval unverified" if previous else "pinned baseline for USB recovery"
    if previous:
        verify_download(manifest["previous"], download)
    # Rewrite only local metadata before any external mutation.
    (folder / "manifest.json").write_bytes(encoded(manifest))
    (folder / "SHA256SUMS").write_text("".join(
        f"{sha((folder / n).read_bytes())}  {n}\n" for n in ASSETS[:-1]))
    release = api.request("POST", "/releases", {
        "tag_name": tag, "target_commitish": os.environ["GITHUB_SHA"],
        "name": f"Lightboard delivery test {manifest['build']['run_id']}",
        "body": "Firmware delivery infrastructure test. No OTA support or device installation. "
                "Assets: candidate application, pinned baseline USB recovery application, manifest, checksums. "
                "No source, prompt, generation record, or compiler log is attached as a release asset.",
        "draft": True, "prerelease": True, "make_latest": "false",
    })
    require(release and type(release.get("id")) is int, "Release creation did not return an ID")
    release_id = release["id"]
    for name in ASSETS:
        data = (folder / name).read_bytes()
        uploaded = api.request("POST", f"/releases/{release_id}/assets?name={name}", binary=data)
        require(uploaded.get("name") == name and uploaded.get("state") == "uploaded" and
                uploaded.get("size") == len(data) and uploaded.get("digest") == f"sha256:{sha(data)}",
                "Uploaded release asset failed verification; feed unchanged")
    api.request("PATCH", f"/releases/{release_id}", {"draft": False, "prerelease": True, "make_latest": "false"})
    # Anonymous HTTPS reads prove public access without transferring an Actions token.
    for name in ASSETS:
        expected = (folder / name).read_bytes()
        require(download(asset_url(tag, name), len(expected)) == expected,
                "Anonymous release readback mismatch; feed unchanged")
    if previous_sha:
        result = api.request("PUT", f"/contents/{FEED_PATH}", {
            "message": f"Publish Lightboard feed {tag}", "branch": BRANCH,
            "sha": previous_sha, "content": base64.b64encode(encoded(manifest)).decode(),
        })
        channel_commit = result["commit"]["sha"]
    else:
        # An orphan branch contains only the feed; no main-branch or workflow edits.
        tree = api.request("POST", "/git/trees", {"tree": [{
            "path": FEED_PATH, "mode": "100644", "type": "blob", "content": encoded(manifest).decode()}]})
        commit = api.request("POST", "/git/commits", {
            "message": "Initialize Lightboard delivery test feed", "tree": tree["sha"], "parents": []})
        api.request("POST", "/git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
        channel_commit = commit["sha"]
    # Commit-addressed readback avoids raw branch CDN propagation lag.
    snapshot_url = f"https://raw.githubusercontent.com/{REPOSITORY}/{channel_commit}/{FEED_PATH}"
    require(download(snapshot_url, 32768) == encoded(manifest),
            "Feed committed but anonymous readback failed; inspect before retrying")
    require(download(FEED_URL, 32768) == encoded(manifest),
            "Feed committed but stable URL is stale or unavailable; inspect before retrying")
    print(f"PUBLICATION_PASSED: https://github.com/{REPOSITORY}/releases/tag/{tag}")
    print(f"Feed: {FEED_URL}")
    print("No model request or device operation; OTA remains disabled.")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID"))
    parser.add_argument("--attempt", default=os.environ.get("GITHUB_RUN_ATTEMPT", "1"))
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    if args.publish:
        require(not args.candidate and not args.baseline, "Publish only an already prepared directory")
        publish(args.output, GitHub(os.environ.get("GH_TOKEN")))
    else:
        require(args.candidate and args.baseline, "Preparation requires candidate and baseline bundles")
        prepare(args.candidate, args.baseline, args.output, args.run_id, args.attempt)
        print(f"PUBLICATION_PREPARED: {args.output}; no network request or publication")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        # Network exceptions can contain signed URLs; only expose their class.
        detail = str(error) if type(error) is ValueError else type(error).__name__
        print(f"STOP: {detail}", file=sys.stderr)
        sys.exit(1)
