#!/bin/sh
# Publish core, react and payload to npm as the signed-in npm account (captiveorigins), after checks.
# Prereleases (e.g. 0.1.0-alpha.9) go to the "alpha" dist-tag, others to "latest".
set -e
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build
TAG=$(node -p "require('./packages/core/package.json').version.includes('-') ? 'alpha' : 'latest'")
# pnpm turns workspace:^ into real versions when publishing.
pnpm -r --filter "./packages/*" publish --access public --tag "$TAG" --no-git-checks
