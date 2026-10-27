# Publishing Falling Ash

The source of truth is `Week-6/Experiments/Experiment-03/` on the `main` branch.

1. Edit the files in this folder and preview `index.html` locally.
2. Commit the changes to `main` and push to GitHub (or use GitHub Desktop's **Push origin**).
3. GitHub Actions automatically publishes the folder to https://pmartin5-gif.github.io/HelloWorld/experiment-03/.

Saving a local file alone does not publish it. The update goes live after the **Publish Experiment 03** workflow succeeds, usually within a few minutes. Check the repository's Actions tab for progress or errors; a failed build leaves the last successful site live. The workflow can also be run manually from the Actions tab.

Do not edit a separate published copy. `.github/workflows/pages.yml` assembles the site directly from this folder. It preserves the other existing Pages URLs using a fixed snapshot of the previous deployment, replacing that snapshot's Experiment 03 folder with the current source on every build. GitHub Pages uses **GitHub Actions** as its publishing source.

The local `tests/` directory, development notes, and `.DS_Store` files are excluded from the published experiment.
