# MoeMail iCloud 地址同步助手

这是 Chrome 的“加载已解压的扩展程序”包。它只复用 Chrome 已登录的 iCloud 会话；不会上传 Apple Cookie，也不会创建 Cloudflare 资源。

## 安装

1. 打开 `chrome://extensions`，开启“开发者模式”。
2. 选择“加载已解压的扩展程序”，选择本目录。
3. 点击扩展图标，填写已部署 MoeMail 的 Workers 地址或正式域名，例如 `moemail.<你的 Cloudflare 账号>.workers.dev`。不填写协议时会自动使用 `https://`，也可以填写包含 `https://` 或 `http://` 的完整地址。
4. 填写 GitHub/Cloudflare 已在使用的 `EXTERNAL_MAIL_SECRET` 的**值**。它不是 Cloudflare API Token。
5. 点击“连接云端项目”，并在 Chrome 的权限提示中允许该域名。

连接成功后，点击“同步地址”会一起同步 iCloud+ 的使用中隐藏地址，以及 iCloud 邮件“设置 → 账户”中的邮箱别名。请先在 Chrome 中打开 iCloud 邮件，并确认登录账号与 MoeMail 主邮箱一致。停用的邮箱别名会保留为停用状态；主邮箱不会被导入为别名。首次同步新别名后，项目会分批重新扫描收件箱，导入该地址已有的邮件。

MoeMail 表格中，普通别名的备注自动显示“别名”。点击这一行的删除按钮，会先确认具体地址，再从 Apple 账户永久删除别名，最后清理项目记录及仅属于该别名的本地邮件。若该别名同时拥有 `@me.com` 或 `@mac.com` 对应地址，Apple 会将它们一并删除，确认框会列出项目中已同步的对应地址。主邮箱不能通过此操作删除。隐藏地址仍沿用先在 Apple 停用、再清理本地记录的流程。

同步结束后，扩展会自动重新加载已打开的对应 MoeMail 页面；地址同步成功但邮箱同步失败时，也会刷新页面以显示已同步的地址。打开 MoeMail 页面后，扩展也会注入桥接脚本，使页面中的 Apple 标签修改、隐藏地址停用与邮箱别名删除操作使用当前 Chrome 的 iCloud 登录会话。只有经过 Apple 确认成功的删除，才会继续清理本地记录；失败时保留原有记录。

升级到 1.0.11 时，需要同时更新 MoeMail 主应用并在 Chrome 扩展管理页重新加载本目录，然后刷新 MoeMail 页面。普通别名接口依据 2026-10-21 Apple Mail 网页版的账户设置实现：读取 `mcc` 服务的 `cc/mail/v1/account/{dsid}/preference/web/all`，通过 `DELETE cc/mail/v1/account/{dsid}/aliases/{emailId}` 删除，随后重新读取清单确认。Apple 私有接口可能变化；单元测试使用模拟响应，不会执行真实别名删除。

批量创建达到 Apple 账号上限后，会自动将使用中的地址同步到项目并刷新已打开的项目页面；即使本次没有创建新地址，也会同步现有地址。创建中途出错但已有地址创建成功时，也会自动同步。请保持侧边栏打开，等待自动同步结束；同步失败会保留本次创建数量，并提示点击“同步地址”重试。创建后的自动同步只同步地址，不拉取邮件。

## 发布关系

扩展随本仓库提交，但不会由 GitHub Actions 上传到 Chrome Web Store。主应用继续按现有 Actions 部署到 Workers；扩展在 Chrome 本地加载。本目录不包含任何密钥、账号地址或 Cloudflare 配置。
