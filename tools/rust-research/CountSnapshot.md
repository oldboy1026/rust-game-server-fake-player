# CountSnapshot：运行服单次只读快照

它通过 Rust 自带 Harmony 加载器读取一次汇总状态，用于没有运行 Oxide 的测试服。它没有 Harmony 补丁、定时器、联网、控制台命令注册或玩家操作，不改变人数、认证、配置、事件或上传时序。它不是人数修复插件。

源码精确锁定当前三个模块的 MVID。其他版本会返回 `unsupported_modules`；需要先重新静态核对并构建，不能直接移除版本检查。

在仓库根目录离线编译，服务端引用目录由参数指定：

```powershell
./tools/rust-research/Build-CountSnapshot.ps1 -ServerDirectory '你的服务端目录'
```

确认 `work/count-snapshot-build/build-safe.json` 成功、输入及输出 SHA 一致后，将自己构建的 `CountSnapshot.dll` 放入该服务端的 `HarmonyMods`，通过管理员控制台执行：

```text
harmony.load CountSnapshot
```

读取 `HarmonyMods/CountSnapshot-state.json`，检查新鲜的 `startedUtc`、`status=captured`、`unloaded=false`。随后立即执行：

```text
harmony.unload CountSnapshot
```

等待同一 `startedUtc` 的 `unloaded=true` 最终文件后，按 SHA 核对并移出自己复制的 DLL，防止下次启动自动加载。不要覆盖别人的同名文件。官方卸载不移除 AppDomain 内已加载的程序集。后台文件写入可能延迟；未确认最终文件前不要再次加载，避免旧实例覆盖新快照。写入失败计数仅在下一次成功写入时可见，输出超时不能当作成功采样。

`OnLoaded` 在加载回调线程读取游戏集合，后台线程只写已经采集的汇总字符串。请使用经核对的官方管理命令路径；不要从任意工作线程直接调用 `OnLoaded`。

字段含义：

| 字段 | 含义与边界 |
| --- | --- |
| `active*` | 加载时的实际活跃玩家列表、存活、睡眠、连接和快照状态；不是公共列表人数 |
| `connection*`、`authenticatedConnections` | 网络连接集合与原版 `isAuthenticated` 查询 |
| `effectiveSecure`、`effectiveEncryption` | 当前 `Net.sv` 运行值，与配置变量分开 |
| `steamInterfaceValid`、`steamLoggedOn` | Steam 接口存在与原版 `BLoggedOn` 结果 |
| `eacInterfaceAvailable` | EAC 接口是否存在，不保证 BeginSession 成功 |
| `eacMappedConnections` | `GetClient` 返回非零句柄的连接数，不保证 RegisterClient 或认证成功 |
| `eacStatusAuthenticatedConnections` | `IsAuthenticated` 的缓存状态查询；非安全分支也能返回 true，不等于有效 EAC 会话 |

玩家与连接/EAC字段分别汇总，没有逐账号关联，不输出身份、姓名、地址、票据或密钥。任一采集异常会使整次返回 `snapshot_failed`，不会把部分数据当作完整结果。

只在加载时采样一次；卸载时的最终文件保留同一次结果并更新卸载标记，**不是第二次采样或连续稳定性证据**。本地未注册公共列表时，这些字段不能证明 Facepunch 后台收录或解释远端资格。
