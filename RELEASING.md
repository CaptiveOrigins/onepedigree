# Releasing

One description everywhere: `package.json` (`description`, `keywords`) is the source; GitHub's description and topics are synced from it before each release, npm takes it at release, and the Release workflow refuses to stage if GitHub differs.

The same process as every Captive Origins package:

1. Bump the same `version` in `packages/core`, `packages/react` and `packages/payload`, commit as `Release x.y.z`, tag `vx.y.z`, and push the commit and the tag.
2. The Release workflow builds, tests and **stages** all three on npm (trusted publishing, no stored token). Prereleases go to the `alpha` dist-tag.
3. The `captiveorigins` npm account approves each with 2FA: npmjs.com → avatar → **Staged Packages** → **Approve**, or `npm stage list` then `npm stage approve <id>`. Only then are they public.

(The desktop app has its own workflow, `desktop.yml`.)
