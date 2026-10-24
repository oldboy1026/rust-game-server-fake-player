# Rust Harmony 加载链与被动返回值诊断设计

2026-10-24。本轮仅用 dnlib 将当前本地程序集作为数据读取，没有加载或执行游戏/未知 DLL，没有安装插件、调用加载命令、重启或更改服务端配置。机器上的 Oxide 文件存在与实际框架加载是两件事；本设计使用 Rust 自带的 Harmony 路径，不依赖 Oxide。

## 已核对的加载契约

`Rust.Harmony.dll` 的 `HarmonyLoader.LoadHarmonyMods`（`06000008`）带有 `RuntimeInitializeOnLoadMethodAttribute`，参数为 `BeforeSceneLoad=1`；该枚举值另由当前 `UnityEngine.CoreModule.dll` 元数据核对。它通过 Unity 生命周期启动，因而没有找到普通托管调用者不能解释为加载器不可达。

该方法从 `Application.dataPath/..` 得到服务端根目录，再选择其直接子目录 `HarmonyMods`。对本机测试服，解析结果是 `D:\RustServer\rustds\HarmonyMods`，与 `RustDedicated.exe` 同级。它枚举该目录顶层 `*.dll`，没有递归扫描，也没有文件监视或定时重扫机制。目录不存在时会尝试创建并结束本次扫描；后来仅复制文件不能证明当前进程已加载它。

`EnsureHarmonyIsLoaded`（`06000007`）从 `Application.dataPath/Managed/0Harmony.dll` 读入 Harmony，当前本地程序集版本为 `2.3.1.1`。它使用反射寻找 `HarmonyLib.Harmony.PatchAll(Assembly)`、`UnpatchAll(string)`、`DEBUG` 和 FileLog 方法。本轮核对的本机版本具备这些签名，无须另放一份 Harmony 依赖。此为静态签名兼容，尚未证明真实进程中的补丁安装成功。

`Assembly-CSharp.dll` 的原生 ConsoleGen（`06000203`）注册了 `harmony.load` 和 `harmony.unload`，两者均为 `ServerAdmin=true`。命令描述明确写有无需重启；包装方法 `ConVar.Harmony.Load/Unload`（`0600A150/0600A151`）分别把第一个参数交给 `TryLoadMod/TryUnloadMod`。将来自写 DLL 的示例命令为：

```text
harmony.load ReportingReturnDiagnostics
harmony.unload ReportingReturnDiagnostics
```

这些是已核对的静态命令契约，本轮没有执行。实际部署前仍应只读确认当前进程的命令注册，不能据磁盘文件直接宣布热加载成功。文件名建议使用固定、无扩展名参数；`TryLoadMod` 只取 basename，并仅按结尾的小写 `.dll` 特殊处理。

## 入口、顺序与卸载

自写入口采用公开、非抽象、公开无参构造的普通类，实现全局接口：

```csharp
public sealed class ReportingReturnDiagnostics : IHarmonyModHooks
{
    public void OnLoaded(OnHarmonyModLoadedArgs args) { }
    public void OnUnloaded(OnHarmonyModUnloadedArgs args) { }
}
```

两个 args 当前均为空的公开引用类型。接口不是 MonoBehaviour 或 RustPlugin 基类；加载器用 `IsAssignableFrom` 查找所有实现类型，再用 `Activator.CreateInstance(Type)` 构造它们。构造函数和类型初始化器应无操作，仅在 `OnLoaded` 中明确启动诊断。

| 顺序 | 当前静态行为 | 对自写诊断的约束 |
| --- | --- | --- |
| 1 | `TryLoadMod` 先尝试卸载同名 mod | 重载会重新建立汇总基线，不能把前后样本当连续窗口 |
| 2 | Cecil 在内存中给程序集名称加 GUID，再 `Assembly.Load(byte[])` | `Assembly.Location` 不适合定位输出目录；文件未被此重命名流程改写 |
| 3 | 创建所有 `IHarmonyModHooks` 实例 | 只保留一个明确入口，不依赖继承的 Unity/Oxide 生命周期 |
| 4 | 创建 owner `com.facepunch.rust_dedicated.<文件名无扩展>` 并先执行 `PatchAll(assembly)` | 若要在 `OnLoaded` 预检后手动安装，不应再添加自动补丁属性 |
| 5 | 调用每个 `OnLoaded`，随后登记为 loaded | 回调异常被记录后仍可能列为 loaded；必须独立核对补丁和成功状态 |
| 6 | 卸载先调用 `OnUnloaded`，再按 loader owner `UnpatchAll(owner)` 并从列表移除 | 先停止采样/写入并屏蔽回调；使用别的 owner 时必须自行精确移除它 |

卸载没有从 AppDomain 释放程序集；内存中的旧程序集仍可存在。加载器自动清理只覆盖它创建的 owner，不能依靠它处理任意自建 owner、计时器或文件句柄。固定文件名时，自写补丁可采用对应的 loader owner，使回调清理之外仍有加载器的 owner 清理；否则必须在 `OnUnloaded` 显式移除自建的精确 target/postfix。禁止无 owner 的全局清理。

启动扫描跳过文件名以 `System.`、`Microsoft.`、`Newtonsoft.`、`UnityEngine.` 开头的已知依赖；自写文件不采用这些前缀。扫描还会注册依赖解析器，在 mod 目录查找所需 DLL。诊断应只引用已经提供的标准库、Rust.Harmony、0Harmony 和 Steamworks 元数据，不附带额外二进制。

## 最小被动设计

目标为 `Steamworks.ISteamGameServer` 的非静态、程序集内可见方法 `bool BUpdateUserData(SteamId, string, uint)`，当前 token 为 `06000220`。它有托管 IL，将原生返回值保存到局部变量，在释放临时 UTF-8 字符串后返回该 bool；上层 `SteamServer.UpdatePlayer` 在 `IL_000D` 丢弃返回值。精确目标、异常和线程边界的进一步说明由独立目标分析报告负责。

建议在 `OnLoaded` 先核对实际程序集/MVID、返回类型、实例方法及三个参数类型，匹配失败则仅写固定错误码并不安装。用 `Harmony.GetPatchInfo(target)` 核对是否已有其他 prefix、postfix、transpiler 或 finalizer；存在竞争补丁时不把观察值称为原始返回，最小实验可直接不安装。安装后再次核对自己预期的单个 postfix，记录真正的成功状态。仅看到 loader 的 loaded 日志不满足此条件。

补丁为手动安装的 `static void Postfix(bool __result)`，返回 void、值参数，无 prefix、transpiler、finalizer，不读取用户标识、姓名、分数、票据、连接对象或其他参数。只用 `Interlocked` 增加正常返回的 true/false 汇总。原调用抛异常时 postfix 不保证执行，因此它不是调用尝试数，也不是失败玩家数。不能主动调用原方法来测试，也不补发玩家资料、Flush、认证或统计事件。

当前 `0Harmony 2.3.1.1` 也已静态确认支持可选的值参数 `bool __runOriginal`：`CreateReplacement`（`060000D0`）把 prefix/postfix/finalizer 合并后检查参数名；只要观察方法请求它，就建立 bool local 并生成 `true` 初始化，再传给 prefix/postfix 生成器。`EmitCallParameter`（`060000D8`）按名字读取该 local。因而在这一版本中无需担心观察方法自己请求该参数却得到无 local 分支的默认 false。它可区分被其他 prefix 跳过的原方法，但不能证明其他 postfix 未改过返回值；是否加入仍由实际实现与隔离测试决定。

输出采用预先固定的本地汇总 JSON 路径，路径可在 `OnLoaded` 主线程由服务端根目录解析并验证。计时器只使用标准库读取原子计数、时间和写入该固定文件，不调用游戏/Steam/分析上报接口，不保留或输出完整标签、身份、地址、原始参数或异常文字。卸载应停止并等待自有写入完成、屏蔽后续计数，再按自身 owner/精确 postfix 清理；运行窗口结束后必须实际核对卸载，不把禁用计数当作补丁已移除。

真实 bool 是一个仍缺少的诊断信号。即便观察到 true，也不等于 Rust 玩家列表、EAC 最终认证或 Facepunch 公共可信人数已经收录。没有安装或运行本设计；是否编译与部署由后续受控实验另行决定。

## 证据

模块 SHA、MVID、方法 token、关键 IL 偏移和明确边界记录在 `harmony-loader-passive-design-2026-10-24.json`。完整 IL、属性和分析脚本仅保留在被忽略的 `work/harmony-loader-static/`。未知 `FakePlayers.dll` 未加入加载目录、未执行，也未请求其内嵌服务。
