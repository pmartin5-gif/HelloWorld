# Cloud API connection test

**Prepared:** November 9, 2026

The Mac successfully retrieved Gemini 3.8 Flash metadata with the saved key. Generation attempts returned model-demand HTTP 503s and timeouts, including low thinking with a 120-second timeout. Metadata success does not establish generation access or explain these failures.

This manual diagnostic runs the same client on GitHub's standard Ubuntu runner. It can show whether generation works from the environment intended for the final workflow. It is not yet the prompt-to-firmware implementation.

## Exact behavior

- Workflow: `.github/workflows/lightboard-api-test.yml` at the repository root.
- Manual only, standard Ubuntu, skipped for private repositories, four-minute timeout, serialized runs.
- Checks out only the two diagnostic scripts.
- Reads the existing project key from the private repository Actions secret `GEMINI_API_KEY`, exposed only to the API-check steps.
- Makes one metadata GET with a 20-second timeout. If it fails, the job stops.
- If metadata succeeds, makes one generation POST to `gemini-3.8-flash`, asking only for `LIGHTBOARD_API_OK`, using low thinking and a 120-second timeout.
- No automatic retries, other model/provider, paid fallback, dependency installation, cache, artifact storage, firmware build, or device upload.
- API keys stay in a request header, never in a URL, file artifact, prompt, or intended log output. HTTP error messages are redacted before printing.

Local execution continues to read the project's private key file, even if another `GEMINI_API_KEY` exists in the Mac's environment. Only the explicit `--actions-secret` flag in GitHub Actions selects the repository secret. Missing secrets stop before any request.

## Setup still pending

The workflow and diagnostic code are prepared locally. The existing key has not been copied to GitHub, and this cloud API test has not run. Storing the key as a repository Actions secret needs the user's approval because it grants the repository's workflows ongoing API access to the existing Google project.

After approval, store the existing free-project key as `GEMINI_API_KEY` in **pmartin5-gif/HelloWorld → Settings → Secrets and variables → Actions**. Recheck that the corresponding Google project remains on Free tier with billing disabled. Keep the account's $0 Actions spending stop and the repository public; the diagnostic uses no artifact storage.

Publish the workflow and its two scripts, then run **Lightboard API connection test** once on main. Record the run URL and observed outcome. `MODEL_INFO_OK` is only metadata success; `LIGHTBOARD_API_OK` is the required generation success. A 503 or timeout leaves generation unverified and calls for another diagnosis or an explicitly reviewed free-model alternative, not repeated automatic runs.

The user's Mac and Lightboard can remain disconnected during the cloud test. Do not include the key in a commit, chat message, or screenshot.
