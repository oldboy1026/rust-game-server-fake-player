# 服务端研究复核工具

这些脚本读取公开资料和本地服务端程序集，不会启动 Rust 或登录玩家账号。工具下载包、原始游戏程序集和生成的中间文件均被 Git 忽略。

需要 Windows PowerShell、Node.js 22+。先在 `steam-multi-account/` 中安装项目依赖，再进入本目录。

## 获取公开资料

`collect.mjs` 接收同目录中的 JSON 清单，把响应、文本摘要和获取元数据保存在 `sources/`。例如：

```powershell
node .\collect.mjs depot-research.json
node .\collect.mjs docs.json
```

另有 `details.json`、`repositories.json`、`game-sources.json`、`steam-reference-source.json` 和 `api-facts.json`。抓取使用 Steam 项目中的代理配置。公开站点或接口之后可能失效，应检查响应状态，不能把错误页当作研究证据。

仓库中的 `rust-research/sources.json` 是原研究时的获取记录，包含原始内容哈希。重新下载是新的观察，内容或哈希可能变化；对应原始网页快照未随仓库提交。

## 准备静态解析工具

```powershell
# 下载固定版本的 dnlib 包与用于交叉核对的 Oxide 包。
node .\download.mjs

# 先运行上述 depot-research.json 抓取，再下载 DepotDownloader 3.4.0。
node .\download.mjs depot
```

`download.mjs` 会在提供预期哈希时核对哈希，并记录实际下载哈希。dnlib 和 DepotDownloader 也可直接从 NuGet、GitHub 的固定版本页面取得。

将 dnlib 4.5.0 包的 `lib/net45/dnlib.dll` 解压到本目录的 `managed/dnlib.dll`。将 DepotDownloader Windows x64 ZIP 解压到 `depot-tool/`。PowerShell/.NET 可将 ZIP 或 NuGet 包作为 ZIP 读取；脚本运行依赖 Windows 的 .NET Framework，无需执行游戏程序集。

## 获取原始服务端程序集

原研究从 Steam App 258550、Windows public 分支获取文件。`server-filelist.txt` 将下载范围限制为 7 个程序集。

在本目录运行：

```powershell
.\depot-tool\DepotDownloader.exe -app 258550 -depot 258551 -manifest 93946663446561466 -os windows -filelist .\server-filelist.txt -dir .\steam-server-files
.\depot-tool\DepotDownloader.exe -app 258550 -depot 258554 -manifest 2507054976021021832 -os windows -filelist .\server-filelist.txt -dir .\steam-server-files
```

不指定账号时使用匿名专用服务器下载。历史 manifest 是否仍可获取取决于 Steam；如果需要使用更新分支，必须记录新的 manifest、哈希和协议版本。

这些文件应位于 `steam-server-files/RustDedicated_Data/Managed/`：

```text
Assembly-CSharp.dll
Assembly-CSharp-firstpass.dll
Facepunch.Network.dll
Facepunch.Raknet.dll
Facepunch.SteamNetworking.dll
Rust.Data.dll
Rust.Global.dll
```

## 静态复核和导出

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\inspect-original.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\sdk-enums.ps1
```

`inspect-original.ps1` 通过 dnlib 读取程序集元数据和选定方法 IL，生成 `original-metadata.json` 和 `original-*.il.txt`。`sdk-enums.ps1` 读取相关 SDK 枚举。先与 `rust-research/evidence.json` 记录的模块 SHA-256、MVID、方法 token 核对。

`export-evidence.mjs` 消费以上生成文件和 `sources/*.meta.json`，包含对研究版本的断言。运行 `node .\export-evidence.mjs` 会**重写**仓库 `rust-research/` 中的 `evidence.json`、`protocol-map.json` 和 `sources.json`，因此只应在有意生成新记录、并已核对输入时运行；提交前查看差异。该脚本是本轮研究版本的导出工具，不是任意 Rust 版本的自动协议分析器。

## 第二轮资料与原生库

`web-research-2026-10-23.json` 保存第二轮 65 个公开资源请求，可以按需要拆分清单交给 `collect.mjs` 重新获取。部分地址已确认缺失，检索结果也只用于发现候选；有效性判断、错误页排除和实际使用状态见 `../../rust-research/web-sources-2026-10-23.json`。不要把渲染器返回的 HTTP 200 自动视作有效文章。

`server-native-filelist.txt` 只匹配本轮分析的原生 RakNet.dll。在本目录运行以下命令可按同一 manifest 获取它：

```powershell
.\depot-tool\DepotDownloader.exe -app 258550 -depot 258551 -manifest 93946663446561466 -os windows -filelist .\server-native-filelist.txt -dir .\steam-server-files
node .\inspect-native.mjs .\steam-server-files\RustDedicated_Data\Plugins\x86_64\RakNet.dll
```

`inspect-native.mjs` 仅从字节读取 PE 头、导入库、命名导出和 SHA-256，不加载或执行 DLL。它可接受可选的第三个命令行参数作为 JSON 输出文件路径，建议放在被忽略的本地目录。证书表字段只反映表是否存在，没有验证 Authenticode 签名。

第二轮 `native-transport-evidence.json` 另外将这些导出与 dnlib 读取的 `Facepunch.Raknet.dll` 的 `MethodDef.ImplMap` 逐项对照，并保存原生声明与可靠性映射证据。该比对仍属于静态分析，不能证明运行时 ABI、目标传输兼容性或 EAC 认证。
