# SFTP Uploader

English | [简体中文](README_zh.md)

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/huangshiyu.sftp-uploader?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader)
[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/huangshiyu.sftp-uploader)](https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader)
[![GitHub Release](https://img.shields.io/github/v/release/huangshiyu13/vscode-sftp?display_name=tag)](https://github.com/huangshiyu13/vscode-sftp/releases)

SFTP Uploader is a maintained VS Code extension for uploading, downloading, diffing, and syncing local folders with remote FTP and SFTP servers.

It keeps the familiar `vscode-sftp` workflow, but is better suited for modern SSH environments where connections go through bastion hosts, OpenSSH aliases, and `ProxyJump`.

It is based on the MIT-licensed `vscode-sftp` codebase and keeps the familiar workflow that many teams already rely on, while improving compatibility with modern OpenSSH setups such as `ProxyJump`, bastion hosts, and SSH aliases defined in `~/.ssh/config`.

## Quick Links

- Marketplace: https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader
- GitHub Releases: https://github.com/huangshiyu13/vscode-sftp/releases
- Repository: https://github.com/huangshiyu13/vscode-sftp
- Issues: https://github.com/huangshiyu13/vscode-sftp/issues
- License: MIT

## Why SFTP Uploader

If you already know and like `vscode-sftp`, this fork is meant to feel familiar.

If your SSH setup is more realistic than "directly connect to one public host", this fork is meant to work better out of the box.

- Keep using `.vscode/sftp.json`
- Keep using familiar `sftp.*` commands
- Keep `uploadOnSave`, manual upload, sync, and Remote Explorer
- Improve compatibility with OpenSSH aliases, bastion hosts, and `ProxyJump`

## Why this fork

This fork exists to keep the extension practical for real development environments:

- Better support for OpenSSH-based workflows
- Improved compatibility with bastion and `ProxyJump` setups
- Familiar `sftp.*` commands and `.vscode/sftp.json` configuration
- The same day-to-day features people expect from the original extension

## Highlights

- Upload on save
- Upload and download individual files or folders
- Sync directories in either direction
- Diff local and remote files
- Remote Explorer integration
- Multiple configurations and profiles
- FTP and SFTP support
- Better OpenSSH config and `ProxyJump` handling
- Debug logging for connection troubleshooting

## What is improved in this fork

- Resolve SSH aliases from `sshConfigPath`
- Preserve `ProxyJump` after `HostName` resolution
- Connect intermediate bastion hosts as raw SSH hops instead of incorrectly trying to open SFTP on every hop
- Keep `uploadOnSave`, manual upload, and Remote Explorer working with bastion-based access

## Installation

### Marketplace

Install directly from the VS Code Marketplace:

https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader

Or inside VS Code:

1. Open the Extensions view.
2. Search for `SFTP Uploader`.
3. Install the extension published by `huangshiyu`.
4. Reload VS Code if prompted.

### VSIX

1. Open the Extensions view in VS Code.
2. Open the Extensions view menu and select `Install from VSIX...`.
3. Pick the generated `.vsix` file.
4. Reload VS Code.

If you already have another `vscode-sftp` fork installed, uninstall or disable it first. This fork keeps the familiar `sftp.*` command namespace, so running multiple variants side by side can lead to duplicate commands or confusing behavior.

## Quick Start

1. Open the local folder you want to sync.
2. Run `SFTP: Config` from the Command Palette.
3. Edit `.vscode/sftp.json`.
4. Save the file.
5. Run `SFTP: Download Project`, `SFTP: Upload Project`, or simply enable `uploadOnSave`.

Basic example:

```json
{
  "name": "my-server",
  "protocol": "sftp",
  "host": "example-host",
  "username": "deploy",
  "remotePath": "/var/www/project",
  "uploadOnSave": true
}
```

The `password` field is optional. If omitted, the extension prompts when needed.

## Recommended SSH Setup: OpenSSH Alias + ProxyJump

For bastion-based environments, the recommended setup is to keep connection logic in `~/.ssh/config` and point the extension at the alias.

`~/.ssh/config`

```sshconfig
Host jump-host
    HostName bastion.example.com
    User deploy
    IdentityFile ~/.ssh/id_ed25519

Host target-alias
    HostName target.internal.example.com
    User root
    IdentityFile ~/.ssh/id_ed25519
    ProxyJump jump-host
```

`.vscode/sftp.json`

```json
{
  "name": "target-alias",
  "protocol": "sftp",
  "host": "target-alias",
  "username": "root",
  "privateKeyPath": "/Users/yourname/.ssh/id_ed25519",
  "sshConfigPath": "~/.ssh/config",
  "remotePath": "/workspace/project",
  "uploadOnSave": true,
  "useTempFile": false,
  "ignore": [".git", ".vscode", "__pycache__", "*.pyc", "*.log"]
}
```

This is the main workflow this fork improves: keep SSH routing in OpenSSH, keep file sync inside VS Code.

## Additional Configuration Examples

### Simple

```json
{
  "host": "host",
  "username": "username",
  "remotePath": "/remote/workspace"
}
```

### Profiles

```json
{
  "username": "username",
  "password": "password",
  "remotePath": "/remote/workspace/a",
  "watcher": {
    "files": "dist/*.{js,css}",
    "autoUpload": false,
    "autoDelete": false
  },
  "profiles": {
    "dev": {
      "host": "dev-host",
      "remotePath": "/dev",
      "uploadOnSave": true
    },
    "prod": {
      "host": "prod-host",
      "remotePath": "/prod"
    }
  },
  "defaultProfile": "dev"
}
```

`context` and `watcher` are only available at root level.

Use `SFTP: Set Profile` to switch profile.

### Multiple Contexts

The `context` values must be unique.

```json
[
  {
    "name": "server1",
    "context": "project/build",
    "host": "host",
    "username": "username",
    "password": "password",
    "remotePath": "/remote/project/build"
  },
  {
    "name": "server2",
    "context": "project/src",
    "host": "host",
    "username": "username",
    "password": "password",
    "remotePath": "/remote/project/src"
  }
]
```

`name` is required in this mode.

### Legacy Hop Configuration

The original `hop` configuration style is still supported. For new setups, using `sshConfigPath` with OpenSSH aliases is usually easier to maintain.

#### Single Hop

local -> hop -> target

```json
{
  "name": "target",
  "remotePath": "/path/in/target",
  "host": "hopHost",
  "username": "hopUsername",
  "privateKeyPath": "/Users/localUser/.ssh/id_rsa",
  "hop": {
    "host": "targetHost",
    "username": "targetUsername",
    "privateKeyPath": "/Users/hopUser/.ssh/id_rsa"
  }
}
```

#### Multiple Hop

local -> hopa -> hopb -> target

```json
{
  "name": "target",
  "remotePath": "/path/in/target",
  "host": "hopAHost",
  "username": "hopAUsername",
  "privateKeyPath": "/Users/hopAUsername/.ssh/id_rsa",
  "hop": [
    {
      "host": "hopBHost",
      "username": "hopBUsername",
      "privateKeyPath": "/Users/hopaUser/.ssh/id_rsa"
    },
    {
      "host": "targetHost",
      "username": "targetUsername",
      "privateKeyPath": "/Users/hopbUser/.ssh/id_rsa"
    }
  ]
}
```

### Configuration in User Settings

You can use `remote` to tell SFTP Uploader to read a connection from [remote-fs](https://github.com/liximomo/vscode-remote-fs).

In user settings:

```json
"remotefs.remote": {
  "dev": {
    "scheme": "sftp",
    "host": "host",
    "username": "username",
    "rootPath": "/path/to/somewhere"
  },
  "projectX": {
    "scheme": "sftp",
    "host": "host",
    "username": "username",
    "privateKeyPath": "/Users/xx/.ssh/id_rsa",
    "rootPath": "/home/foo/some/projectx"
  }
}
```

In `sftp.json`:

```json
{
  "remote": "dev",
  "remotePath": "/home/xx/",
  "uploadOnSave": false,
  "ignore": [".vscode", ".git", ".DS_Store"]
}
```

## Remote Explorer

Remote Explorer lets you browse files on the remote server.

1. Run `View: Show SFTP`.
2. Or click the SFTP view in the Activity Bar.

You can view remote file content directly. To make local edits, run `SFTP: Edit in Local`.

### Multiple Select

You can select multiple files or folders at once in Remote Explorer by holding `Ctrl` or `Shift`, similar to the local explorer.

You may need to manually refresh the parent folder after deleting a file if the explorer does not update immediately.

### Order

You can order the Remote Explorer by adding `remoteExplorer.order` to `sftp.json`.

```json
{
  "remoteExplorer": {
    "order": 1
  }
}
```

The default value is `0`.

## Debug

1. Open user settings.
2. Set `sftp.debug` to `true`.
3. Reload VS Code.
4. View logs in `View > Output > sftp`.

## Resources

- FAQ: [FAQ.md](FAQ.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Support: [SUPPORT.md](SUPPORT.md)
- Publishing guide: [PUBLISHING.md](PUBLISHING.md)
