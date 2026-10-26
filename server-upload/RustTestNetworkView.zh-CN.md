# RustTestNetworkView：管理员模拟网络视图

**这是单独的、明确标注模拟数据的测试视图。它不会修改 `Connection.ipaddress`、真实延迟、其他插件的玩家日志、Rust status、A2S、Steam/EAC或Facepunch人数。** 没有部署到目标服务器，不能作为公共人数修复。

仅为管理员选定且当前已连接的账号生成模拟IP及10～200ms模拟延迟。地址使用文档专用网段192.0.2.0/24、198.51.100.0/24、203.0.113.0/24，避免冒用真实公网地址；同时选择的账号地址不重复。默认15分钟、最多60分钟、最多50个；30秒清理一次，查询时也检查到期/断开/连接替换。不跨连接或重启保留。

## 文件位置

将同目录 `RustTestNetworkView.cs` 放到已安装兼容Oxide/uMod的Rust服务器：

```text
<Rust服务器根目录>/oxide/plugins/RustTestNetworkView.cs
```

由Oxide编译加载，**不要**将本地验证DLL放入Managed、extensions或HarmonyMods。纯原版服不直接支持此插件。目标服版本和兼容性须以实际加载结果为准。

## 操作

仅接受服务器本地控制台或已有受保护RCON；游戏内玩家（包括authLevel2管理员）不能调用。无需插件密码、API、开放新端口或上传账号文件。

```text
oxide.load RustTestNetworkView
testnetwork.add <测试账号SteamID64>
testnetwork.add <测试账号SteamID64> 10
testnetwork.snapshot
testnetwork.rotate
testnetwork.remove <测试账号SteamID64>
testnetwork.clear
oxide.unload RustTestNetworkView
```

`add`仅创建或续期模拟条目；重复添加保持原模拟值。`rotate`重新分配所有已选条目的模拟值，不续期。`snapshot`返回TEST别名、`source=simulation`、`simulated=true`、`simulatedIp`和`simulatedPingMs`。条目不回显真实IP、账号ID或昵称；没有改写底层对象，因此清除/卸载无需恢复真实连接。

插件不写账号配置或数据文件，不主动记录IP/身份，也不联网。但服务器、RCON客户端或其他插件可能记录管理员输入的命令参数；若需保留记录，按私有数据保护。部署和使用不需要服务器登录密码出现在源码、命令示例或Git仓库。

卸载后移走 `oxide/plugins/RustTestNetworkView.cs`，以免服务器重启时重新加载。无需删除其他插件或重启服务器。

此功能只适合测试管理界面对模拟值的展示。它不会使现有管理员插件显示随机地址，也不能验证或改变Facepunch有效玩家资格。

## 离线验证

已用本机现有Oxide/Rust参考库完成编译，且同源隔离测试通过权限、参数、容量、随机范围/唯一性、真实连接不变、续期、连接替换、过期、断线和卸载清理。未在目标服加载；离线验证不能代替目标版本兼容性检查。

仓库根目录下可复核（Windows自带.NET Framework编译器）：

```powershell
./tools/rust-research/Build-RustTestNetworkView.ps1 -ReferenceDirectory <匹配版本的引用目录>
./tools/rust-research/Test-RustTestNetworkView.ps1
```

引用目录需包含Oxide.Core.dll、Oxide.CSharp.dll、Oxide.Rust.dll、Facepunch.Console.dll、Facepunch.Network.dll。生成文件默认位于被Git忽略的`work/`；服务器上传的交付物始终是`.cs`源文件。验证摘要见`rust-research/network-view-simulation-2026-10-26.json`。
