# MoeMail iCloud 地址同步助手

这是 Chrome 的“加载已解压的扩展程序”包。它只复用 Chrome 已登录的 iCloud 会话；不会上传 Apple Cookie，也不会创建 Cloudflare 资源。

## 安装

1. 打开 `chrome://extensions`，开启“开发者模式”。
2. 选择“加载已解压的扩展程序”，选择本目录。
3. 点击扩展图标，填写已部署 MoeMail 的 Workers 地址或正式域名，例如 `https://moemail.<你的 Cloudflare 账号>.workers.dev`。
4. 填写 GitHub/Cloudflare 已在使用的 `EXTERNAL_MAIL_SECRET` 的**值**。它不是 Cloudflare API Token。
5. 点击“连接云端项目”，并在 Chrome 的权限提示中允许该域名。

连接成功后，可以同步使用中的 iCloud 隐藏地址、创建新地址和删除已停用地址。打开 MoeMail 页面后，扩展也会注入桥接脚本，使页面中的 Apple 标签修改与停用操作使用当前 Chrome 的 iCloud 登录会话。

## 发布关系

扩展随本仓库提交，但不会由 GitHub Actions 上传到 Chrome Web Store。主应用继续按现有 Actions 部署到 Workers；扩展在 Chrome 本地加载。本目录不包含任何密钥、账号地址或 Cloudflare 配置。
