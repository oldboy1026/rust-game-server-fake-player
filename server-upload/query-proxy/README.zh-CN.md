# A2S 查询代理：部署与公共人数对照

这是将 `server-query-fake-player-count` 的查询回复修改功能重新实现为 Node.js 的测试工具。它修改 A2S_INFO 的人数，并在 A2S_PLAYER 后追加名称为 `[A2S TEST] N` 的测试条目。原玩家条目保留，Rust `cp` 标签保留；默认追加数量为 0，测试上限为 50。

工具只处理查询流量。它不建立 Rust 玩家连接、不创建 Steam/EAC 会话，也不代表 Facepunch 已把测试条目计为有效玩家。即使直接查询代理看到了增加的人数，也必须另行验证公共查询确实经过代理，并观察 Facepunch 的新数据批次。

## 文件放哪里

它是独立 Node.js 进程，不是 Oxide 插件或扩展 DLL，**不要放进 `oxide/plugins` 或 `RustDedicated_Data/Managed`**。在服务器上选择独立目录，例如 `D:\RustQueryProxy`，上传打包工具生成的整个目录，保留这些相对路径：

```text
RustQueryProxy/
  package.json
  README.zh-CN.md
  manifest.json
  tools/rust-research/run-query-proxy.mjs
  steam-multi-account/src/rust-query-proxy.js
  rust-research/query-server.mjs
```

需要 Node.js 22 或更新版本；此独立包无 npm 依赖，不需要上传账号数据、API 密钥、`node_modules`、Steam 凭据或游戏 DLL。

在项目根目录生成包：

```powershell
powershell -NoProfile -File tools/rust-research/Build-QueryProxyPackage.ps1
```

输出位于被 Git 忽略的 `work/query-proxy-package-时间戳`。脚本只复制上述公开源码和说明，生成 `type: module` 的 `package.json` 与 SHA-256 清单；不会运行代理、修改系统网络或重启游戏服务器。

## 本机先做对照

在已上传的包根目录执行，假设同机 Rust 原始查询端口为 40177，游戏端口为 40176：

```powershell
node tools/rust-research/run-query-proxy.mjs --host 127.0.0.1 --game-port 40176 --query-port 40177 --listen-port 42177 --add-players 0 --duration-seconds 300
```

此时代理只监听 `127.0.0.1:42177`。先确认原始查询与透传查询一致；结束后再启动追加数量为 1 的对照：

```powershell
node tools/rust-research/run-query-proxy.mjs --host 127.0.0.1 --game-port 40176 --query-port 40177 --listen-port 42177 --add-players 1 --duration-seconds 300
```

另开终端可用包内查询工具检查原始和代理 INFO；此命令也会查询 RULES：

```powershell
node rust-research/query-server.mjs --host 127.0.0.1 --port 40177
node rust-research/query-server.mjs --host 127.0.0.1 --port 42177
```

人数受 INFO 的最大人数和 A2S 单字节上限限制。压缩分片回复暂不支持，收到时记录上游错误；普通分片支持重组。程序默认 300 秒后停止，允许 10–900 秒，按 Ctrl+C 也可停止。日志只输出配置、聚合计数及错误分类，不输出真实玩家名称或查询者地址。

## 系统网页和 API

本机系统 `/rust` 中的“A2S 查询代理测试”提供启动、停止、读取状态和“采集三方对照”。需要先解锁本地管理页面。该入口固定为回环监听，适合核对原始 A2S、代理 A2S 和 Facepunch 公共人数。

API 沿用系统现有 Bearer 鉴权和同源限制：

```text
GET    /v1/rust/query-proxy
POST   /v1/rust/query-proxy
DELETE /v1/rust/query-proxy
POST   /v1/rust/query-proxy/sample
```

启动请求体示例：

```json
{"host":"127.0.0.1","gamePort":40176,"queryPort":40177,"listenPort":42177,"addPlayers":1}
```

采样请求体为 `{}`。返回包含两路 A2S 人数及 `cp`、Facepunch 人数和缓存批次信息。Facepunch 查询按配置中的游戏端点进行；上面的回环地址仅用于演示，请在查询公共数据时填写实际服务器 IPv4。`publicPathVerified: false` 明确表示此 API 没有验证公共流量经过代理。

## 公共查询路径是另一项部署工作

仅启动 `42177` 监听不会改变 Steam 已登记的查询端口，也不会让 Facepunch 自动访问它。在修改任何端口前，先记录游戏端点、Steam 实际登记的查询端点、当前 Rust 监听地址、宿主机/NAT 的 UDP 映射及对应回滚配置。

需要对外监听的短时测试可显式执行：

```powershell
node tools/rust-research/run-query-proxy.mjs --host 127.0.0.1 --game-port 40176 --query-port 40177 --listen-host 0.0.0.0 --listen-port 42177 --add-players 1 --duration-seconds 300 --public-test
```

这只创建监听，不会设置防火墙、UDP 转发或 Steam 登记。监听端口与上游查询端口必须不同。**Windows 的 `netsh interface portproxy` 是 TCP 转发，不能用它接管 A2S 的 UDP 查询。** 实际入口如何接到代理，必须按服务器当前的宿主机、面板、NAT/UDP 转发能力决定，不能直接套用未知环境的命令。

在维护窗口内，管理员应按以下顺序验证：

1. 保存原始 INFO/PLAYER、`cp`、真实游戏连接数，以及 Facepunch 人数、`Last-Modified`、`Age`。确认 Steam 登记指向哪一个查询端口。
2. 先追加 0，安排一个可恢复的 UDP 路径，使同一个已登记公共查询入口经过代理、代理再访问独立的原始查询入口。公共端口已被游戏进程占用时，不能让两个进程抢占端口；是否需要改配置和重启游戏取决于实际部署，工具不会自动执行。修改原始查询配置后也必须复核 Steam 登记，避免登记绕过代理的新端口。
3. 从服务器外部查询已登记入口，同时确认代理请求计数增加及 INFO 中的游戏端口、Rust 标识正确。只查询临时端口成功不构成公共路径验证。
4. 透传正常后，在约定短时窗口内追加 1，确认外部 INFO/PLAYER 的测试差异，且 `cp` 与实际玩家连接不被修改。
5. 观察 Facepunch 的新 `Last-Modified` 批次。相同批次、重复缓存读取和代理自身输出都不能当作公共后台采纳证据。公共接口只有聚合人数，不能据此判断某个账号被认可。
6. 停止代理，立即恢复保存的原始 UDP 路径/配置，并从外部复核原入口查询恢复。程序到期只停止自身，**不会自动撤销管理员在外部配置的 UDP 映射**；若映射仍指向已停代理，查询会中断。

若没有可控 UDP 入口，或无法安排所需维护窗口，则目前只能完成本机查询对照，公共路径实验仍待完成。一次新批次未变化也不能单独证明 Facepunch 的内部规则；应记录真实结果，不把“代理人数改变”写成“公共人数修复”。
