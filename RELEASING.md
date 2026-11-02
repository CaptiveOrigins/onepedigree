# Releasing

Every version is published to npm by the `captiveorigins` npm account, from a maintainer's machine, so npm lists `captiveorigins` as the publisher. Nothing publishes from CI (the desktop app workflow only builds the app).

1. Bump the same `version` in `packages/core`, `packages/react` and `packages/payload`, commit as `Release x.y.z`, tag `vx.y.z`, push the commit and the tag.
2. Publish all three while signed in to npm as `captiveorigins` (2FA prompt):

   ```bash
   git pull && sh scripts/publish.sh
   ```
