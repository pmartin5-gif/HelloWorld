# Experiment 06 — Flock Clock: Conversation Log

## 1. Preserve the flock clock and create a new experiment

**Intent:** Duplicate the current flock clock animation into a new experiment in the experiments folder so future exploration preserves the original version.

**Execution:** Copied `Experiment-01-Murmuration-Clock` into `Experiment-06-Flock-Clock`, including the HTML, CSS, JavaScript, README, and existing simulation checks. Used 06 because Experiment 05 became the Week-8 image borkilator. Updated only the copied README to identify the new working location and its local publication status. Recorded the original file hashes in `baseline.sha256.json`. The original files and hosting configuration were left unchanged.

**Objective checks:** Verified every copied file against the source before updating the copied README. Verified the original source hashes again after duplication. Runtime files and existing simulation checks remain identical to their source. The copied `node tests/simulation.cjs` suite passed: 8,000-bird population, formation timing and stability, a full simulated minute, local clock behavior, and narrow-screen resize bounds. These headless checks use mocked Canvas rendering and do not establish browser appearance.

**Fulfillment:** The independent local starting copy is ready for new experiments. No animation changes, commit, or publication were requested or performed. The user's evaluation of the next direction remains open.

## 2. Give 20% of the flock the ability to defy the rules

**Intent:** Create a version in which 20% of the flock can defy the rules.

**Execution:** Interpreted ability as a persistent, randomly selected group with intermittent individual departures rather than permanent refusal. Exactly 1,600 of the default 8,000 birds receive this role, including birds assigned to clock numerals. Each has a separate 9–17 second rhythm that smoothly replaces ordinary alignment, cohesion, currents, and clock attraction with a personal turning course and a speed limit up to 1.75 times normal. Between departures they rejoin the existing behavior. Separation, pointer response, edge turns, and the final coordinate bounds remain active. The other 80% retain the original steering rules. Identity persists through minute changes and resizing; population changes reselect the rounded 20% share. Updated the page title, accessible description, and README. Work remains in Experiment 06 as established in entry 1.

**Objective checks:** JavaScript syntax and the expanded, seeded simulation suite pass. Checks cover the exact share, membership in both clock and free birds, persistent identity, independence from clock phase and destinations during departure, target response on return, the higher speed allowance, and actual faster bursts. The existing 8,000-bird grid checks, a full minute at 1,000 birds, local clock behavior, and narrow-screen resize checks also pass. During the held numeral phase, the obedient birds' 95th-percentile destination error was 3.38 pixels in the synthetic mask. Every original Experiment 01 file still matches its baseline SHA-256 hash. Chrome preview was attempted but the browser security policy rejected local `file:` navigation; no alternate access was attempted. Native visual appearance has not been verified.

**Fulfillment:** The new local behavior is implemented and its headless checks pass. The user's assessment of the movement and this interpretation of defiance remains open. No commit or publication was performed.

## 3. Publish the independent flock clock

**Intent:** Create a public URL so the user can share Experiment 06 with others.

**Execution:** Extended the repository's existing GitHub Pages workflow to publish the three runtime files at `https://pmartin5-gif.github.io/HelloWorld/experiment-06/`. Added project-path triggers so later changes on `main` redeploy at the same address. The existing original clock remains at the root URL. Updated README with the destination and publication instructions.

**Objective checks:** Verified local Pages assembly preserves existing projects and includes exactly the three matching Experiment 06 runtime files. Every original Experiment 01 file still matches its baseline hash. The unchanged simulation has the passing checks recorded in entry 2. Deployment completion is tracked separately below.

**Fulfillment:** Publication is authorized and the deployment changes are prepared. Success will be recorded after GitHub confirms deployment.
