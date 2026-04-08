# Publishing SFTP Uploader

This repository is prepared to publish the extension as `huangshiyu.sftp-uploader`.

## One-time setup

1. Create the publisher `huangshiyu` in the Visual Studio Marketplace:
   https://marketplace.visualstudio.com/manage/publishers/
2. Create an Azure DevOps personal access token with the `Marketplace > Manage` scope:
   https://dev.azure.com/
3. Log in once from this repository:

```bash
cd /Users/huangsy16/huangshiyu/Task/repos/vtm/vscode-sftp-proxyjump-1163
npx @vscode/vsce login huangshiyu
```

Paste the PAT when prompted.

## Release checklist

1. Make sure `package.json` has the correct version.
2. Update `CHANGELOG.md`.
3. Run the validation commands:

```bash
npm run compile
npm test
```

4. Build a local package:

```bash
npm run package
```

5. Optionally install the generated VSIX locally for a final smoke test:

```bash
code --install-extension sftp-uploader-<version>.vsix --force
```

## Publish

Publish the current version exactly as written in `package.json`:

```bash
npm run publish:marketplace
```

Or let `vsce` bump the version and publish in one step:

```bash
npm run publish:patch
npm run publish:minor
npm run publish:major
```

## Manual upload fallback

If CLI publishing fails, you can still upload the generated `.vsix` from the publisher management page:

https://marketplace.visualstudio.com/manage/publishers/

## Notes

- The extension ID is `huangshiyu.sftp-uploader`.
- The current publisher is `huangshiyu`.
- Avoid installing another fork of `vscode-sftp` at the same time because the command namespace is still `sftp.*`.
