# Contribution Guide

This project accepts fixes, features, tests, and documentation updates through pull requests against `develop`.

## Development environment

- Use Node.js 20 LTS. The repository includes `.nvmrc` for convenience.
- Install dependencies with `npm ci`.
- Build the extension with `npm run compile`.
- Package a local VSIX with `npm run package`.

## Required checks before every commit or pull request

Run these commands locally before you push:

```bash
npm run lint
npm run compile
npm run test:coverage
```

Or run the combined command:

```bash
npm run verify
```

These checks are also enforced in GitHub Actions:

- `style_check`: runs the repository lint rules.
- `unit_test`: compiles the extension, runs Jest, and publishes coverage artifacts.

## Testing expectations

- Every bug fix should include a regression test when the behavior can be reproduced in unit tests.
- Every new feature should add or update tests for the new behavior.
- If you intentionally leave a gap untested, explain why in the pull request.
- Prefer focused tests next to the implementation under `src/**/__tests__/`.
- Keep test data generic. Do not commit private hosts, usernames, internal domains, keys, or company-specific paths.

## Coverage expectations

- Pull requests should not reduce coverage for the code they touch without a clear reason.
- Use `npm run test:coverage` to generate local reports under `coverage/`.
- When possible, add tests for the happy path and at least one failure or edge case.
- GitHub Actions uploads `coverage/cobertura-coverage.xml` and `coverage/lcov.info` to Codecov through `codecov/codecov-action@v5` with OIDC.
- The first successful `develop` build establishes the Codecov project baseline.
- Review both project coverage and patch coverage in Codecov before merging risky changes.
- Repository coverage rules live in `codecov.yml`. Update them in the same pull request if you intentionally change the coverage bar.

## Codecov setup notes

- Repository page: `https://app.codecov.io/gh/huangshiyu13/vscode-sftp`
- New repository onboarding: `https://app.codecov.io/gh/huangshiyu13/vscode-sftp/new`
- If coverage uploads do not appear yet, make sure the Codecov GitHub App is installed for this repository and re-run the `unit_test` workflow on `develop`.
- The `unit_test` workflow already has the required GitHub permissions for OIDC uploads:
  - `contents: read`
  - `id-token: write`

## Style and formatting

- Follow `.editorconfig` defaults: UTF-8, LF, spaces, and a final newline.
- Keep TypeScript aligned with the repository `tslint` rules.
- Run `npm run lint` before submitting changes.
- Keep examples and docs privacy-safe. Use placeholders such as `example.com`, `target.internal`, or `bastion.example.com`.

## Pull request checklist

- Base branch: `develop`
- Small, focused scope with a clear title
- Tests added or updated for changed behavior
- `npm run verify` passes locally
- README, changelog, schema, or docs updated when user-facing behavior changes
- No secrets or internal infrastructure names in code, tests, screenshots, logs, or documentation

## Suggested workflow

```bash
nvm use
npm ci
git checkout -b fix/my-change
npm run verify
```

Open a pull request only after the branch is ready for review.

## Release workflow

This repository also provides a `Makefile` to keep release steps repeatable.

Common targets:

```bash
make help
make verify
make package
make github-release
make marketplace-publish
```

Typical release flow for a new version such as `0.1.1`:

```bash
# 1. Update package.json version and CHANGELOG.md
# 2. Add release notes at release-notes/v0.1.1.md

make verify
make package
git add .
git commit -m "Release v0.1.1"
git tag -a v0.1.1 -m "Release v0.1.1"
git push fork develop
git push fork v0.1.1
make github-release VERSION=0.1.1
make marketplace-publish VERSION=0.1.1
```

Notes:

- `make github-release` expects `gh auth login` to be configured.
- `make marketplace-publish` expects `vsce login huangshiyu` to be configured.
- Keep the release notes file in `release-notes/` aligned with the GitHub release body.
