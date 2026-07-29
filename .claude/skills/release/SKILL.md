---
name: release
description: Use when the user wants to ship, release, or publish a new Calm the Chaos version to the Chrome Web Store — "ship it", "cut a release", "publish an update", "package the extension", "build the zip", "update the store listing", or asks how to get a fix out to users.
---

# release — package the extension and ship it to the Chrome Web Store

## Overview

Build `dist/`, package it as a zip the Chrome Web Store will accept, and hand the
user the upload link. The store item is `cholkigafekgccbkfgcmcigihipbnjoe`
([listing](https://chromewebstore.google.com/detail/calm-the-chaos/cholkigafekgccbkfgcmcigihipbnjoe)).

Core principle: **the zip is built from the working tree, so the tree's state IS
the release.** Two failures are silent at package time and only surface as a
store rejection hours later: an unbumped version, and zipping the folder instead
of its contents. Verify both from inside the zip before handing it over.

## Workflow

1. **Report the tree state before building.** `git status --short`. Uncommitted
   changes to `scripts/`, `popup/`, `options/`, `styles/` or `keywords/` get
   compiled into the package. Name the files and ask whether they're meant to
   ship. Proceed if the user says so — just never package silently.

2. **Bump the version.** Edit `"version"` in `manifest.json` (root, not
   `dist/`). The store rejects a package whose version is already published, and
   nothing local warns you. Patch bump unless the user says otherwise.

3. **Build and test.** `npm test` — runs `npm run build` (webpack production)
   then both suites. Look for `compiled successfully` plus `# fail 0` and a green
   vitest summary.

4. **Zip `dist`'s contents, not the folder.** `manifest.json` must be at the zip
   root:
   ```powershell
   Compress-Archive -Path dist\* -DestinationPath calm-the-chaos-<version>.zip -Force
   ```
   `*.zip` is gitignored, so the repo root is fine.

5. **Verify from inside the zip** — not from `dist/`, since packaging is where
   nesting bugs appear:
   ```powershell
   $t="$env:TEMP\ctc-zipcheck"; Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue
   Expand-Archive calm-the-chaos-<version>.zip -DestinationPath $t
   Get-Content "$t\manifest.json" | Select-String '"version"|service_worker'
   ```
   Require: bumped version, `"service_worker": "background.js"` with no `dist/`
   prefix (webpack's copy transform strips it), and `manifest.json` at the root.

6. **Hand off the upload.** It's browser-only:
   https://chrome.google.com/webstore/devconsole → **Calm the Chaos** →
   **Package** → **Upload new package** → **Submit for review**. The live version
   stays up until approval. Mention that permission changes trigger slow manual
   review; a routine MV3 update usually clears in hours to days.

## Gotchas

| Symptom | Reality |
|---|---|
| Old mtimes on `dist/background.js`, `popup.js` after a build | Not a stale build. Webpack reports `[compared for emit]` and skips rewriting byte-identical assets. Trust `compiled successfully`, not timestamps. |
| Store rejects the upload as a duplicate version | Step 2 was skipped, or that version shipped already. Bump again and re-zip. |
| Extension loads but the service worker 404s | The zip has a `dist/` wrapper folder. Re-zip with `dist\*`, not `dist`. |
| Asked to ship a keyword-catalog or trending change | Catalog changes ship in the package; the trending engine does **not**. It runs in `.github/workflows/trending.yml` and publishes to a gist, so users get it with no store update. Check which one the change touches before packaging. |
