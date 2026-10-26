# A2S 查询代理集成与实服查询对照

日期：2026-10-26，Asia/Shanghai。结构化结果见同名 JSON。

## 已实现

按用户要求，将 [server-query-fake-player-count](https://github.com/anatolykopyl/server-query-fake-player-count) 的两项核心功能重新实现为 Node.js：修改 A2S_INFO 人数，并向 A2S_PLAYER 追加测试条目。原项目复核固定提交为 `ffd3edd24466dc4b40a5521fbc7cc666672947d2`，详见前一份源码复核报告。本次未复制 Go 源文件，也不依赖 Go、Docker 或额外 npm 包。

- 新模块 `steam-multi-account/src/rust-query-proxy.js`：保留真实条目及 Rust `cp`，追加明确命名的 `[A2S TEST] N`；默认 0，最多 50，并受最大人数和单字节边界约束。
- 转发 challenge 时复用每个查询客户端的上游 UDP socket；支持未压缩分片重组及大回复分片。不支持压缩分片，收到时报告错误。
- 设置请求速率、客户端数量、超时和分片大小上限；只接受 INFO/PLAYER/RULES 查询。状态输出聚合计数，不暴露真实玩家名称和查询者地址。
- 本地 Bearer API：`GET/POST/DELETE /v1/rust/query-proxy`，`POST /v1/rust/query-proxy/sample {}`。管理端只创建回环监听；采样对照原始 A2S、代理 A2S、Facepunch 人数及缓存批次。
- `/rust` 已提供启动、停止、三方采样和状态控件，并通过真实浏览器操作验证。
- 独立运行器支持明确指定公共监听及 10–900 秒测试窗口；打包脚本只复制三份公开源码、说明、模块配置及 SHA-256 清单。

这项代理实现不创建 Rust 玩家、不生成 EAC 会话。`publicPathVerified` 和 `effectiveEacEstablished` 均保持 false，不以代理查询差异冒充公共后台接纳。

## 实际结果

目标游戏端点为 `61.147.247.25:40176`，本次直接查询上游 `40177`；A2S 返回的 Rust 标识及游戏端口相符。本轮 Steam 查询端口发现请求失败，因此没有取得新的 Steam 登记证明。

| 对照项 | 本次结果 |
| --- | --- |
| 原始 A2S_INFO | players 0，maxPlayers 200，cp 0 |
| 回环代理 A2S_INFO，追加 2 | players 2，maxPlayers 200，cp 0 |
| 回环代理 A2S_PLAYER | count 2，两个 `[A2S TEST]` 条目 |
| 运行中主服务的 API 采样 | HTTP 200，原始 0、代理 2、cp 0/0 |
| Facepunch 公共映射 | `target_not_listed`，不能当作人数 0 |

模块实测时间为 16:40:38，API 成功采样为 16:44:22，网页随后在 16:45:03 显示相同的 0/2 对照。Facepunch 成功响应的 `Last-Modified` 均为 16:39:55；08:40 和 08:44 UTC 的读取属于同一批次，不能算独立新批次。首次网页采样的公共来源失败显示未知，稍后重新采样成功取得上述批次信息；没有把初次失败当作后台人数。

测试代理只监听本机；远程公共 UDP 查询路径尚未接管。因此，本轮**未验证 Facepunch 公共人数增加**，也未建立有效 Rust EAC 会话。

## 验证及服务状态

- Node 全部测试 68/68，通过的代理专项测试 10 项覆盖人数修改、challenge、分片、PLAYER、超时清理、鉴权及 API 采样等。
- 独立部署包在无 npm 依赖的目录中实际运行：查询得到 2 个测试条目，10 秒窗口结束后自然退出 0，stderr 为空，剩余查询客户端为 0。
- 控制重载前重新读取实时状态：Steam 在线 48，活动 Rust 连接 0。保存当前账号及设置后正常关闭旧服务，再启动单个新服务；48 个 Steam 登录全部恢复，autoConnect 设置一致。没有按历史五人或十六人名单重建游戏连接。
- 16:46:50 最终核对：Steam 在线 48/48，Rust 已入服 0，查询代理已停止，查询客户端 0。
- 本次未更改远程防火墙、游戏配置、插件、UDP 转发或公共登记，也未上传任何账号数据或远程凭据。

本机原始 API 快照保存在 workspace 的忽略目录 `work/query-proxy-integration/`；公开 JSON 只汇总安全结果。便携包由脚本生成在仓库忽略目录 `work/query-proxy-package-*`，不将账号数据装包。

## 仍待完成

用户已确认面板支持 UDP 转发；还需取得面板地址及当前公共入口到后端的映射，核实监听和维护条件。先保留原规则，再将**已登记的公共 UDP 查询入口**接到代理，代理访问独立原始入口；不能只改一个无人查询的临时端口。游戏端口与查询端口必须分别核实。

接管后需要从外部查询登记入口，并核对代理计数；先追加 0 验证透传，再在短时窗口追加 1，对照 Facepunch 新 `Last-Modified` 批次。测试结束恢复原规则并验证查询恢复；代理自动退出不会自动恢复面板映射。

部署位置、命令、API 和回滚检查见 [部署说明](../server-upload/query-proxy/README.zh-CN.md)。Windows `netsh interface portproxy` 不支持 UDP，不能用于本实验。
