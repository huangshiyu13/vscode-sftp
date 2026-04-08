SHELL := /bin/bash

PUBLISHER := huangshiyu
REPO := huangshiyu13/vscode-sftp
REMOTE ?= fork
VERSION ?= $(shell node -p "require('./package.json').version")
VSIX := sftp-uploader-$(VERSION).vsix
RELEASE_NOTES := release-notes/v$(VERSION).md

.PHONY: help lint compile test coverage verify package clean check-clean tag push-tag github-release marketplace-publish release

help:
	@echo "Available targets:"
	@echo "  make verify                    Run lint, compile, and coverage checks"
	@echo "  make package                   Build a VSIX for the current package.json version"
	@echo "  make tag VERSION=0.1.1         Create an annotated release tag"
	@echo "  make push-tag VERSION=0.1.1    Push develop and the release tag to $(REMOTE)"
	@echo "  make github-release VERSION=0.1.1"
	@echo "                                 Create a GitHub Release using gh and release-notes/v<version>.md"
	@echo "  make marketplace-publish VERSION=0.1.1"
	@echo "                                 Publish the packaged VSIX to the VS Code Marketplace"
	@echo "  make release VERSION=0.1.1     Run verify, package, GitHub release, and Marketplace publish"

lint:
	npm run lint

compile:
	npm run compile

test:
	npm run test:unit

coverage:
	npm run test:coverage

verify: lint compile coverage

package:
	@test "$$(node -p "require('./package.json').version")" = "$(VERSION)" || \
		(echo "package.json version does not match VERSION=$(VERSION)"; exit 1)
	npx @vscode/vsce package --out "$(VSIX)"

clean:
	rm -f ./*.vsix

check-clean:
	@git diff --quiet || (echo "Working tree has unstaged changes"; exit 1)
	@git diff --cached --quiet || (echo "Index has staged but uncommitted changes"; exit 1)

tag: check-clean
	@test -f "$(RELEASE_NOTES)" || (echo "Missing release notes: $(RELEASE_NOTES)"; exit 1)
	@test "$$(node -p "require('./package.json').version")" = "$(VERSION)" || \
		(echo "package.json version does not match VERSION=$(VERSION)"; exit 1)
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"

push-tag:
	git push "$(REMOTE)" develop
	git push "$(REMOTE)" "v$(VERSION)"

github-release: package
	@test -f "$(RELEASE_NOTES)" || (echo "Missing release notes: $(RELEASE_NOTES)"; exit 1)
	gh auth status
	gh release create "v$(VERSION)" "$(VSIX)" \
		--repo "$(REPO)" \
		--title "v$(VERSION)" \
		--notes-file "$(RELEASE_NOTES)"

marketplace-publish: package
	npx @vscode/vsce publish --packagePath "$(VSIX)"

release: verify tag push-tag github-release marketplace-publish
