# Cloud API connection test

**Tested:** November 9, 2026

The Mac successfully retrieved Gemini 3.8 Flash metadata with the saved key. Generation attempts returned model-demand HTTP 503s and timeouts, including low thinking with a 120-second timeout. Metadata success does not establish generation access or explain these failures.

This manual diagnostic runs the same client on GitHub's standard Ubuntu runner. It can show whether generation works from the environment intended for the final workflow. It is not yet the prompt-to-firmware implementation.

## Exact behavior

- Workflow: `.github/workflows/lightboard-api-test.yml` at the repository root.
- Manual only, standard Ubuntu, skipped for private repositories, four-minute timeout, serialized runs.
- Checks out only the two diagnostic scripts.
- Reads the existing project key from the private repository Actions secret `GEMINI_API_KEY`, exposed only to the API-check steps.
- The manual workflow explicitly selects one reviewed model. Current choices are `gemini-3.5-flash-lite` (workflow default) and `gemini-3.8-flash`. Recheck its current free allowance before each test; an allowed name is not a permanent pricing guarantee.
- Makes one metadata GET for the selected model with a 20-second timeout. If it fails, the job stops.
- If metadata succeeds, makes one generation POST to the selected model, asking only for `LIGHTBOARD_API_OK` with a 120-second timeout. Flash-Lite uses supported `minimal` thinking; 3.8 Flash uses `low`. There is no fallback between them.
- No automatic retries, other model/provider, paid fallback, dependency installation, cache, artifact storage, firmware build, or device upload.
- API keys stay in a request header, never in a URL, file artifact, prompt, or intended log output. HTTP error messages are redacted before printing.

Local execution continues to read the project's private key file, even if another `GEMINI_API_KEY` exists in the Mac's environment. Only the explicit `--actions-secret` flag in GitHub Actions selects the repository secret. Missing secrets stop before any request.

## Current result — Flash-Lite passed

The user authorized a separate free Gemini 3.5 Flash-Lite test after the 3.8 Flash failure, then pushed the explicit selector in commit `691f82728d098d8f08d0a7c7007f3a3f1e7ab4b8`. Eight mocked tests passed before publication, covering model configuration, credential isolation, rejection before network access, redaction, and no retries. The CLI local default remains 3.8 Flash; use `--model gemini-3.5-flash-lite` to select Lite locally.

Immediately before the test, verified the public repository and the personal-account `lightboard-prompter` project on Free tier with Set up billing available. Observed Flash-Lite allowance: 15 RPM / 250,000 TPM / 500 RPD, with zero displayed usage before the run. Billing remained disabled. These observed limits do not guarantee future availability.

[Run 42727547923](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42727547923), job `129536952110`, succeeded in 13 seconds overall. Authenticated metadata returned `MODEL_INFO_OK`; one minimal-thinking generation returned `LIGHTBOARD_API_OK` in approximately 4.04 seconds. Generation ran from 00:20:36.942 to 00:20:40.986 UTC on November 10 (November 9 locally). No retries, model/provider fallback, artifacts, cache, firmware build, or device operation occurred. The authorized one-test diagnostic is complete; no automatic repeat is scheduled.

Verification record: `api-lite-verification.json`. Sanitized log: `../.build/cloud-api-run-42727547923/diagnostic.log`; screenshot: `../.build/cloud-api-run-42727547923/github-success.jpg`. The actual saved key was checked absent from the log.

This verifies small API generation with Lite. It does not establish animation quality or implement prompt-to-firmware integration. The user subsequently deferred creative review and requested infrastructure work. The integrated manual pipeline in `prompt-build.md` validates and compiles candidates without a preview or aesthetic approval. Its first cloud generation passed but validation rejected an unsupported call; the second run identified a `rand()` false positive; the unchanged response compiles locally, and fix `1cd37ca` awaits publication. The board can remain unplugged.

## Existing private secret

The user explicitly approved saving the existing free-project key as `GEMINI_API_KEY` in **pmartin5-gif/HelloWorld → Settings → Secrets and variables → Actions**. GitHub confirmed Repository secret added before the original cloud test. The Lite run reused that secret; no new key or credential access was created. Keep its value out of source, prompts, logs, screenshots, and firmware. The original private local key remains outside Git.

Recheck the corresponding Google project's free allowance and disabled billing for subsequent model work. Preserve the account's $0 Actions spending stop and the public repository. This diagnostic uses no artifact storage.

## Historical 3.8 Flash result — unresolved

Commit `4c63bf81af5d4abb0fd17bac4f993a23dfd44dee` introduced the original diagnostic. [Run 42724339342](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42724339342), job `129525988360`, passed authenticated metadata. Its one low-thinking 3.8 Flash generation request timed out after 120 seconds, from 23:55:50 to 23:57:50 UTC on November 9, before an HTTP response. The job failed without retry or fallback.

That model had also timed out on the Mac. The cause remains unknown; Lite's success does not explain or fix 3.8 Flash. Preserve `api-verification.json` and `../.build/cloud-api-run-42724339342/diagnostic.log`. No identical rerun is scheduled.
