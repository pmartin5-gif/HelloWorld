# Lightboard firmware delivery test

This is Step 6. **Lightboard publication test** builds the preserved baseline and the exact saved heart response, prepares a small delivery package, and optionally publishes it. It makes zero model requests and performs no device operation. The test images have **no Wi-Fi or OTA support**.

**Verified November 9, 2026:** [Run 42746766266](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42746766266) passed on published `7e47654`, creating [the first delivery release](https://github.com/pmartin5-gif/HelloWorld/releases/tag/lightboard-test-42746766266-1) and the feed below. Linux application: **291,200 bytes**; recovery baseline: **290,960 bytes**. All four assets passed server size/SHA-256 checks and anonymous byte-for-byte download checks before the feed advanced. Both feed readbacks passed; an independent GitHub connector read matches the logged manifest. Provenance records original generation `42735010470` and `model_request_in_this_run: false`. This does not establish ESP32 TLS compatibility, Wi-Fi association, runtime memory, physical installation, or recovery. Evidence: `publication-verification.json` and `.build/cloud-publication-run-42746766266/`.

## Delivery route and cost

Public GitHub Release assets hold the binaries; a separate `lightboard-feed` branch holds a small manifest. The proposed stable feed is:

`https://raw.githubusercontent.com/pmartin5-gif/HelloWorld/lightboard-feed/manifest.json`

This URL was created by the successful publication above. The branch starts with only this manifest and does not change main. Each release has a unique `lightboard-test-<run-id>-<attempt>` tag and is a prerelease with `make_latest: false`, so it does not become the repository-wide latest release. Existing Lightboard releases/assets are never overwritten or deleted by this code.

[GitHub documents](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) no total release-size or bandwidth limit, with each asset below 2 GiB. Our two application images total approximately 583 KB. [Standard runners for public repositories are free](https://docs.github.com/en/billing/concepts/product-billing/github-actions). The workflow stops before allocating a runner for private repositories or other branches, uses standard `ubuntu-24.04`, and stores no Actions artifact or cache. It needs no paid hosting, personal access token, model key, billing change, or new account. Stop if the free public route becomes unavailable.

## Public contents

Only four assets are attached:

- `firmware.bin`: compiled saved heart application.
- `recovery.bin`: newly compiled preserved baseline application, matching the pinned source foundation.
- `manifest.json`: versions, source hashes, application SHA-256/size/URL, original generation run/response hash, current build run, board profile, and explicit `ota_enabled: false`.
- `SHA256SUMS`: hashes of the other three assets.

The feed adds the previous publication, or the baseline recovery entry on the first run. The pinned baseline recovery is included on every release. A previous publication is not automatically a physically tested or approved version. The baseline is source-equivalent to the preserved sketch; its recompiled bytes need not equal the historical flashed binary. `recovery.bin` is an application image, not a complete flash package. Actual USB recovery uses the preserved sketch and Arduino IDE, with existing bootloader/partition backups retained separately.

No source file, creative prompt, generation record, or compiler log is attached as an asset. The repository and its workflow logs remain public. GitHub automatically exposes source archives for each release tag; those archives contain the public repository at that commit, including already committed prompts and saved response fixtures. Release metadata and branch history are public. Keep credentials out of the repository and every firmware image. This fixed test builds the locked source and saved response, neither of which contains Wi-Fi credentials. The later OTA foundation must use separately provisioned private credentials, not passwords compiled into public binaries.

## Publication sequence and failure behavior

The implementation is `cloud/publish.py`, invoked by `.github/workflows/lightboard-publication-test.yml`. It verifies all 84 pinned inputs, existing bundle checksums, source boundaries, response provenance, application size/header, and board/tool versions. It allowlists the four output files and refuses an existing output directory.

Publication requires the matching main-branch Actions run, a public repository, and no change to main since checkout. The temporary `GITHUB_TOKEN` has `contents: write` for the single job; checkout does not persist it and only the publication step receives it as `GH_TOKEN`. This permission is needed to create releases and update the feed. No new secret needs to be created. All action revisions and the Arduino CLI/core remain pinned.

It reads the current feed, checks the previous firmware is still publicly downloadable and matches its checksum, creates a draft release with a unique tag, uploads all assets, and verifies server-reported size/digest. Only then does it publish the prerelease. It downloads all four assets anonymously over HTTPS and compares the exact bytes before advancing the feed. Authenticated API calls refuse redirects; anonymous download redirects are restricted to GitHub HTTPS hosts and carry no credential.

For an existing feed, the update supplies the previously read file SHA. A conflicting update stops without replacing that file. The first feed is created on a separate orphan branch only after all release downloads pass. Both commit-addressed and stable feed URLs are checked anonymously after the update. No automatic retry, overwrite, cleanup, or deletion occurs.

A failed build, upload, or asset readback leaves the previous feed available. A conflict can leave a complete, unreferenced release; an upload failure can leave a draft. A final feed readback failure can happen after the feed has committed, including CDN propagation delay. Inspect the existing state before any manual rerun; do not treat that failure as proof the feed was unchanged. Old release assets and feed commit history remain available.

## Run after publication of the workflow

1. Push the prepared code commit through the established Terminal SSH route. Keep unrelated edits out of the commit.
2. Open **Actions → Lightboard publication test → Run workflow**, select main.
3. **Publish** defaults to off: this compiles and prepares files on the runner without writing a release or feed. For the actual delivery test, select **Publish**. This explicitly publishes the four public assets and Lightboard feed; it does not install firmware.
4. Send the run link to the assistant. Inspect compile results, manifest provenance, `PUBLICATION_PASSED`, anonymous readback checks, and the feed's current/previous entries. A successful preparation-only run is not successful publication.
5. Open the resulting stable manifest and firmware link from another device. Actual ESP32 TLS/network compatibility is still a later hardware check. No broad GitHub credential belongs on the board.

All previous animation checkpoints, historical binaries, and the live sketch remain preserved. No board upload is part of this test. The first Wi-Fi/OTA installation extends the protected foundation in a separately prepared development copy and uses Arduino IDE for the initial USB installation.

SHA-256 checks detect byte corruption; the manifest and binaries rely on GitHub HTTPS/account trust. This test does not implement firmware signing, anti-rollback, boot health confirmation, or device recovery. Those decisions and physical tests belong to the OTA foundation before automatic installation is enabled.

## Local verification

`python3 -m unittest discover -s tests -v` includes failure-ordering, corruption, feed conflicts, duplicate releases, preservation of previous firmware, repository/ref checks, and restricted redirects. Mocked tests do not establish real GitHub publication or physical recovery.

An isolated real local check compiled the baseline and exact unchanged heart response using CLI 1.5.1 / core 2.0.17, then prepared only the four delivery assets. Baseline: **290,944 bytes**. Candidate: **291,216 bytes**. Both pinned-input checks and bundle/provenance checks passed. Output is `.build/publication-local-check/`; its run ID `1` is a synthetic local fixture, not a published release. The subsequent cloud result is recorded separately above and in `publication-verification.json`.
