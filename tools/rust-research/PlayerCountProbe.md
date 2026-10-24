# PlayerCountProbe 0.1.0

目标：在实际已注册服务器上，对照指定研究账号与其他连接的正常状态，定位为何“入世界”和“公共列表人数增加”不同步。它是只读诊断，不是人数修复插件。

## 首次部署

将 `PlayerCountProbe.cs` 保持原文件名上传至目标服 `oxide/plugins/`。Oxide正常情况下会自动编译/加载，无需重启。先只上传这一个文件；暂不需要安装Harmony候选DLL、修改安全/analytics设置或改变正常玩家连接。

加载后可通过已有RCON读取：

```text
playercountprobe.snapshot
```

先确认 `version=0.1.0`、`monitoring=true`、`sample.status=sampled`，并读取三个运行模块MVID。只有文件存在、编译成功或命令名出现，均不能代替有效运行快照。若未加载，保留对应编译错误，不要绕过缺失API或权限。

研究账号由管理程序从已有账号信息中读取，并在已有私有RCON通道配置内存分组；用户无需提供或输入管理ID。命令为 `playercountprobe.focus`，参数是最多20个唯一的17位十进制Steam身份，每个独立参数；`playercountprobe.focus clear`恢复未分类。配置命令仅RCON可用；响应只返回数量和新窗口时间。不要把实际参数放入公开报告、Git或截图。

插件不写身份到文件、不回显参数，但服务器自身RCON审计、面板历史或外部工具可能记录命令，不能承诺这些系统没有记录。改变focus会创建新统计窗口，旧窗口中的在途回调不会混入新窗口。Steam服务连接/断开计数则为整个插件加载期计数。

## 读取内容和解释

每5秒正常主线程采样，snapshot也会立即重新采样。返回 `focused`、`other`、`unclassified` 三组：

| 内容 | 含义和限制 |
| --- | --- |
| active/alive/dead/sleeping/connected/receivingSnapshot | 实际活跃列表中的状态数量 |
| networkEntries/networkConnected/networkAuthenticated | 网络连接集合的数量，与活跃列表分母分开 |
| Steam验证回调OK/NonOK及时间 | 窗口内真实公开事件；NonOK包括取消或后续失效，不等于被拒绝入服数；没有补记加载前事件 |
| effectiveSecure/effectiveEncryption | 当前运行值；不由配置整数推断 |
| steamInterfaceValid/steamLoggedOn | Steam接口存在与后台登录状态 |
| eacInterfaceAvailable/eacMapped/eacStatusAuthenticated | 分别为接口、非零句柄与缓存状态；均不能独立证明有效受保护会话或EOS token最终成功 |
| rawTickRatePositive | 原版 `rawTickCount` 缓存速率大于0的活跃条目数；不是累计包数、有效输入数或人数资格 |
| inputHookCalls/inputHookObserved | 可选 `OnPlayerInput` 被实际调用的次数；false/0只表示未观察到，可能是框架未派发，不能断言客户端没发输入 |

focus未设置时，所有对象和回调均归unclassified。other只是未匹配指定账号，**不自动等于真人**。指定账号身份也不证明该账号当时由哪种客户端使用，需结合受控连接时序。

插件不读取或输出输入内容、位置、姓名、票据、管理凭据或回调用户/所有者身份。可选输入hook是void观察，不拦截处理。Steam事件回调只做内存分类和原子计数，不访问Unity对象；游戏集合仅在正常框架主线程采样。错误以固定类别替代，不回显原异常；采样失败会用新失败状态替换旧成功快照。

各计数独立读取，并非事务快照；并发回调时不能要求validations永远精确等于OK+NonOK。列表不可用有独立可用性标志，不能把不可读当0人。

## 收尾与验证状态

实验结束可通过RCON执行：

```text
oxide.unload PlayerCountProbe
```

它会解除事件订阅、销毁计时器并清除当前内存分组。若之后不需要，应将上传的源码移出插件目录，防止下次启动自动加载；不要删除其他插件。

当前已通过本机真实服务端/Oxide引用离线编译、独立静态复核和同源stub隔离测试13组339断言（38个响应隐私检查）。**尚未在目标服加载，真实钩子送达、远端兼容和公共人数效果均待验证。** 构建工具为 `Build-PlayerCountProbe.ps1`，证据见 `rust-research/playercount-probe-preparation-2026-10-24.json`。
