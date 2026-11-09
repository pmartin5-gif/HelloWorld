# Lightboard baseline cloud build

**Prepared:** November 9, 2026

This is Step 4: compile a known working scene on GitHub. It needs no Lightboard, USB connection, model key, or Gemini request. It has no upload, OTA, email, release-publication, or deployment step.

## Preserved build inputs

- Arduino CLI 1.5.1 and ESP32 core 2.0.17.
- The full board options from the last recorded successful upload, including 4 MB configured flash and the default partition layout.
- The exact uploaded November 6, 18:44 source, with the ruby and moonstone stack over a bronze base. The `.ino` contents are unchanged; the folder and file are renamed together to `LightboardBaseline` for a portable Arduino sketch.
- The exact installed PxMatrix 1.8.2, Adafruit GFX 1.13.0, and Adafruit BusIO 1.17.4 sources, with their licenses, under `vendor/`. PxMatrix 1.8.2 was not in the locally cached library index, so this build uses its preserved source rather than selecting a different version.
- A SHA-256 inventory in `build-lock.json`, checked before and after compilation.

`local-verification.json` records the isolated Mac build. It passed with a 290,944-byte application binary and 21,984 bytes of static DRAM. The 1,310,720-byte application slot leaves 1,019,776 bytes of image headroom. This is a build measurement, not runtime heap or a physical flash-capacity measurement. Linux output may differ because of host/toolchain build details. The GitHub Linux build has not yet run.

The revised creative prompt lives in `../generationBrief.md`. This baseline-only build does not regenerate a scene or test the revised per-pixel brightness instructions.

## Cost controls

The workflow is `.github/workflows/lightboard-baseline.yml` at the repository root.

- It runs only through the manual **Run workflow** button.
- The job is skipped before runner allocation if the repository is private.
- It uses the standard `ubuntu-24.04` hosted runner, with a 20-minute timeout and serialized jobs.
- It uses no Actions cache, model API, paid runner, or paid fallback.
- **Save firmware** defaults to off. Compile-only runs create no stored firmware artifact.
- An explicitly requested download contains only three binary files, a build report, and checksums, with one-day retention.

On November 9, GitHub's account UI showed GitHub Free, Actions storage **0 GB used / 0.5 GB included**, and an existing account-level **$0 Actions budget** marked **Usage blocked**. These settings were inspected without changing them. Confirm that the spending stop and sufficient free storage still apply before selecting **Save firmware**. If the free allowance is unavailable, leave downloads off and defer that part of the milestone.

GitHub documents [free standard runners for public repositories and separate storage billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Short retention alone does not guarantee free storage; the account's allowance and spending stop matter.

## Run on GitHub after publication

1. Review the Lightboard files and publish this workflow and build folder to the default branch. Keep unrelated working-tree changes out of the commit. The workflow must exist on the default branch to appear as a new manual workflow.
2. Open the repository's **Actions** tab and choose **Lightboard baseline build**.
3. Select **Run workflow**. Leave **Save firmware** off for compilation only. Turn it on only after confirming the free-storage conditions above.
4. Wait for a successful **Compile the baseline with the pinned core** step. A successful local build is not a successful GitHub run.
5. If downloads were enabled, download the `lightboard-baseline-…` artifact from the run's summary. Unzip it and verify `SHA256SUMS` with `shasum -a 256 -c SHA256SUMS` on the Mac.

The artifact contains:

- `LightboardBaseline.ino.bin`: application image.
- `LightboardBaseline.ino.bootloader.bin`: bootloader image.
- `LightboardBaseline.ino.partitions.bin`: partition table image.
- `build-report.json`: versions, source/build-lock hashes, binary hashes, and size measurements.
- `SHA256SUMS`: checksums for the other four files.

This firmware has no Wi-Fi update support. Downloading or compiling it does not install it on the board or verify its physical behavior. Device installation remains a later, separately controlled step.

## Local validation

Verify preserved input hashes without a compiler or network:

```bash
python3 cloud/build.py --verify-only
```

Reproduce the local compile using the already installed toolchain on this Mac:

```bash
python3 cloud/build.py \
  --cli '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli' \
  --data-dir /Users/pmartin5/Library/Arduino15
```

Run these commands from `Week-8/LightBoard_Prompter`. Build outputs go under the ignored `.build/` folder. User libraries, build files, and CLI configuration are isolated from the live IDE sketch and helper. The `--data-dir` option reads the installed core; it cannot be combined with `--install-core`.

For the GitHub runner, `--install-core` installs the pinned core into the build's own data directory. The three drawing libraries are already preserved in the repository. The build script verifies the CLI and installed core versions and rejects altered source/library files. It never runs a serial or upload command.

## Remaining checks

- [x] Confirm repository visibility, observed free storage, and the existing spending stop.
- [x] Preserve and verify the uploaded baseline and dependencies.
- [x] Compile the isolated copy locally and verify the resulting checksums.
- [ ] Publish the reviewed workflow/build files to the default branch.
- [ ] Observe a successful GitHub Linux run.
- [ ] Download and verify the cloud-generated firmware.

Step 5 still requires a successful free Gemini API generation test. Earlier model-demand errors and a timeout have not completed that test.
