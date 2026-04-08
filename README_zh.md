# SFTP Uploader

[English](README.md) | 简体中文

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/huangshiyu.sftp-uploader?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader)
[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/huangshiyu.sftp-uploader)](https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader)
[![GitHub Release](https://img.shields.io/github/v/release/huangshiyu13/vscode-sftp?display_name=tag)](https://github.com/huangshiyu13/vscode-sftp/releases)

SFTP Uploader 是一个维护中的 VS Code 扩展，用来在本地工作区和远程 FTP / SFTP 服务器之间进行上传、下载、对比和同步。

它基于 MIT 许可的 `vscode-sftp` 代码库继续演进，保留了很多团队已经习惯的使用方式，同时补强了更贴近真实生产环境的 SSH 场景，比如 `ProxyJump`、堡垒机和 `~/.ssh/config` 里的 SSH alias。

## 快速链接

- Marketplace：https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader
- GitHub Releases：https://github.com/huangshiyu13/vscode-sftp/releases
- 仓库：https://github.com/huangshiyu13/vscode-sftp
- Issues：https://github.com/huangshiyu13/vscode-sftp/issues
- 许可证：MIT

## 为什么叫 SFTP Uploader

如果你已经习惯了 `vscode-sftp` 的用法，这个 fork 应该还是熟悉的。

如果你的 SSH 环境不是“直接连一台公网机器”那么简单，而是要经过堡垒机、SSH alias 或 `ProxyJump`，这个 fork 会更适合你。

- 继续使用 `.vscode/sftp.json`
- 继续使用熟悉的 `sftp.*` 命令
- 保留 `uploadOnSave`、手动上传、同步和 Remote Explorer
- 更好地兼容 OpenSSH alias、堡垒机和 `ProxyJump`

## 这个 fork 的定位

这个 fork 不是为了推翻原有工作流，而是为了把常见的文件同步体验继续维护下去，并补齐现代 SSH 环境里的关键能力：

- 更好地支持基于 OpenSSH 的连接方式
- 更好地兼容堡垒机和 `ProxyJump`
- 保留熟悉的 `sftp.*` 命令和 `.vscode/sftp.json` 配置方式
- 继续提供原扩展里最常用的上传、下载、同步和 Remote Explorer 能力

## 主要功能

- 保存即上传
- 上传和下载单个文件或整个目录
- 本地与远程双向同步
- 本地与远程文件对比
- Remote Explorer 远程文件浏览
- 多配置和多 profile
- 同时支持 FTP 和 SFTP
- 更好的 OpenSSH 配置与 `ProxyJump` 支持
- 支持调试日志排查连接问题

## 这个 fork 额外强化了什么

- 支持通过 `sshConfigPath` 解析 SSH alias
- 在解析 `HostName` 之后继续保留 `ProxyJump`
- 中间堡垒机按原始 SSH hop 处理，而不是错误地在每一跳都尝试打开 SFTP subsystem
- 让 `uploadOnSave`、手动上传和 Remote Explorer 在 bastion 场景下也能正常工作

## 安装

### 从 Marketplace 安装

可以直接从 VS Code Marketplace 安装：

https://marketplace.visualstudio.com/items?itemName=huangshiyu.sftp-uploader

或者在 VS Code 里：

1. 打开扩展视图。
2. 搜索 `SFTP Uploader`。
3. 安装 `huangshiyu` 发布的版本。
4. 如果提示重载 VS Code，就执行重载。

### 从 VSIX 安装

1. 打开 VS Code 的扩展视图。
2. 打开扩展菜单，选择 `Install from VSIX...`。
3. 选择生成好的 `.vsix` 文件。
4. 安装后重载 VS Code。

如果你已经装了别的 `vscode-sftp` 分支版，建议先卸载或禁用。这个 fork 保留了 `sftp.*` 命令空间，同时装多个变体时容易出现重复命令或行为混淆。

## 快速开始

1. 在 VS Code 里打开你要同步的本地目录。
2. 运行命令 `SFTP: Config`。
3. 编辑 `.vscode/sftp.json`。
4. 保存配置文件。
5. 运行 `SFTP: Download Project`、`SFTP: Upload Project`，或者直接打开 `uploadOnSave`。

基础示例：

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

`password` 字段不是必须的；如果不写，扩展会在需要时提示输入。

## 推荐方式：OpenSSH Alias + ProxyJump

如果你的环境需要经过堡垒机，推荐把连接逻辑写在 `~/.ssh/config` 里，再让扩展直接使用 SSH alias。

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

这也是这个 fork 重点优化的工作流：SSH 路由交给 OpenSSH，文件同步留在 VS Code 里完成。

## 更多配置示例

### 简单配置

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

`context` 和 `watcher` 只能出现在根级别。

使用 `SFTP: Set Profile` 可以切换 profile。

### 多 Context

多个 `context` 不能重复。

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

这种模式下 `name` 是必须的。

### 旧版 Hop 配置

原始 `hop` 配置方式依然兼容。如果是新的堡垒机场景，一般更推荐 `sshConfigPath + SSH alias` 的写法，维护成本更低。

#### 单跳

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

#### 多跳

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

### 从用户设置读取 remote

你也可以通过 `remote` 让扩展从 [remote-fs](https://github.com/liximomo/vscode-remote-fs) 读取连接配置。

在用户设置里：

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

在 `sftp.json` 里：

```json
{
  "remote": "dev",
  "remotePath": "/home/xx/",
  "uploadOnSave": false,
  "ignore": [".vscode", ".git", ".DS_Store"]
}
```

## Remote Explorer

Remote Explorer 用来浏览远端文件。

1. 运行 `View: Show SFTP`。
2. 或者直接点击 Activity Bar 里的 SFTP 视图。

你可以直接查看远端文件内容；如果要在本地编辑，运行 `SFTP: Edit in Local`。

### 多选

在 Remote Explorer 里可以按住 `Ctrl` 或 `Shift` 一次选择多个文件或目录，体验和本地资源管理器类似。

如果删除文件后界面没有立刻更新，手动刷新一下父目录即可。

### 排序

你可以在 `sftp.json` 里通过 `remoteExplorer.order` 控制 Remote Explorer 的顺序：

```json
{
  "remoteExplorer": {
    "order": 1
  }
}
```

默认值是 `0`。

## 调试

1. 打开 VS Code 设置。
2. 把 `sftp.debug` 设为 `true`。
3. 重载 VS Code。
4. 在 `View > Output > sftp` 里查看日志。

## 相关文档

- 常见问题：[FAQ.md](FAQ.md)
- 更新记录：[CHANGELOG.md](CHANGELOG.md)
- 支持与反馈：[SUPPORT.md](SUPPORT.md)
- 发布说明：[PUBLISHING.md](PUBLISHING.md)
