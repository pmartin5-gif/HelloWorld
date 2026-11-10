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

## Current setup and run

The user explicitly approved the secret transfer and one free cloud test. Commit `4c63bf81af5d4abb0fd17bac4f993a23dfd44dee` is published on main. Created `GEMINI_API_KEY` as the approved private Actions secret after confirming the free Google project still showed Free tier and billing disabled. GitHub confirmed Repository secret added. No credential value was printed or committed.

The one approved diagnostic was dispatched: [run 42724339342](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42724339342), job `129525988360`. Authenticated metadata lookup passed. The single generation request timed out after 120 seconds before an HTTP response; the job failed. No automatic retry or fallback occurred. See `api-verification.json`. No rerun is authorized or scheduled by this record.

For later setup review, the existing free-project key is stored as `GEMINI_API_KEY` in **pmartin5-gif/HelloWorld → Settings → Secrets and variables → Actions**. Recheck that the corresponding Google project remains on Free tier with billing disabled. Keep the account's $0 Actions spending stop and the repository public; the diagnostic uses no artifact storage.

The workflow and scripts are published, and the one approved run is complete. It did not validate generation. Do not repeat it automatically. `MODEL_INFO_OK` is only metadata success; `LIGHTBOARD_API_OK` is the required generation success. A 503 or timeout leaves generation unverified and calls for another diagnosis or an explicitly reviewed free-model alternative, not repeated automatic runs.

The user's Mac and Lightboard can remain disconnected during the cloud test. Do not include the key in a commit, chat message, or screenshot.

## Observed result

GitHub job `129525988360` completed metadata verification at 23:55:50 UTC. The single generation request then ran from 23:55:50 to 23:57:50 UTC and ended with TimeoutError, without an HTTP response. The same model had timed out on the Mac. This does not identify the root cause or establish that every model will fail. The user subsequently authorized a separate Gemini 3.5 Flash-Lite test. The model selector is prepared locally; that alternative test has not run yet.

The private Actions secret remains saved as approved. No Google billing setting changed. The diagnostic created no artifact, cache, firmware, or device update. Sanitized job log: `../.build/cloud-api-run-42724339342/diagnostic.log`.

## Flash-Lite test preparation

On November 9 the user said “ok let's try that” in response to the proposed free Gemini 3.5 Flash-Lite test. Rechecked the personal-account Lightboard project in AI Studio: Free tier, Set up billing available, and Flash-Lite limits of 15 requests/minute, 250,000 tokens/minute, and 500 requests/day, with zero displayed usage. Google's current Standard pricing also lists free-tier input/output. These observations do not guarantee availability or quality.

Added explicit model selection to the existing workflow and client. The workflow passes the selection through a quoted environment variable; the client rejects names outside the two reviewed choices before reading a key or sending a request. Eight mocked tests and workflow checks pass, without network calls. CLI local default stays 3.8 Flash for compatibility; the workflow defaults to the explicitly selected Flash-Lite alternative. A local Lite invocation must include `--model gemini-3.5-flash-lite`.

Publication of this selector is pending the user's Terminal push. Then run one cloud test with `gemini-3.5-flash-lite` selected, using the existing private secret. No new credential or approval for the already-completed secret transfer is needed. Do not adopt Lite for unattended animation generation until a successful API response and creative-output review are recorded.
