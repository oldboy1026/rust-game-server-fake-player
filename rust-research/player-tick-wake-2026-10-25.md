# 独立程序：一次普通 PlayerTick 唤醒

后续更新：本文件记录初次实现时的离线证据。其后已用一个真实账号观察到三帧完成和自身 Sleeping 清除，并发现首帧后缺少连接维护会在约62秒超时。维护实现和实际复核结果以 `connection-timeout-fix-2026-10-25.md` 为准；下文“未实测”为初次提交时状态。

用户确认继续保持独立程序，优先完成 PlayerTick 与唤醒。2026-10-25 新增实现和离线验证；没有新增真实连接、启动官方客户端、读取认证票据、修改服务端安全配置、重启本地服务或改变既有会话。有效 EAC 受保护会话仍未实现；原有 EAC/非零加密拒绝继续生效。

## 实现

`tools/rust-research/rust_player_tick.py` 为当前 worker 增加可选的一次输入周期。`rust-peer.py --wake-on-connect` 或 API `wakeOnConnect:true` 启用；默认关闭，两个页面有“入服后尝试唤醒一次”。单账号和批量接口都严格校验布尔选项。新后端需重启后加载，本次未自动重启用户的服务。

发送条件：已发送身份和 Ready、批准加密级别为零、自身实体精确 FinishLoading、完整自身快照本地接收年龄不超过两秒、连接全局实体更新序号前进、Alive 且健康值为正、Connected 且不在 ReceivingSnapshot/Spectating/Wounded/LoadingAfterTransfer 状态。当前只支持静止接地、无父实体/坐骑、非水中、非特殊移动的直立/蹲伏状态。服务端快照时间只用于拒绝回退，不把它与本地时钟相减。

从完整自身 Entity 保留私有位置、视角及完整 ModelState；完整 Protobuf 省略的零值恢复为零。缺失 ModelState.flags 不猜测 OnGround。父/坐骑缺失按完整消息默认零解析。非零旧 mount pose 可以在下坐骑后保留：只要当前 mounted UID/flags 均为零，就保留 poseType，不把它误判为仍在坐骑上。眼位使用当前支持的无父实体、中立身体、直立/蹲伏模型，y 为角色 y+1.5−0.6×ducking；不支持爬行、身体侧倾、坐骑眼位或相机模拟。

一次最多三帧，调度间隔设计为 50 毫秒：中立按钮0、普通蹲伏按钮64、中立释放0；收起活动物品，不使用攻击或管理员命令。每帧写入 inputState、position、modelState、activeItem=0、eyePos、parentID=0、deltaMs=50；Input 与模型向量逐分量显式写零，避免服务端 ProtoDelta 继承未知旧按键、父实体或模型值。原生传输使用既有 Medium 优先级、RELIABLE_ORDERED=3、channel=0；抓包支持可靠性/通道，50毫秒调度和 Medium 优先级是本实现选择，不声称复刻了官方所有优先级/节奏。

重复/旧自身序号不刷新状态；0xFFFFFFFF 无序号样本只做诊断。实体替换清除 FinishLoading 关联，旧实体唤醒不能用新实体确认。自身未知 RPC、EntityDestroy、EntityPosition、基础 EntityFlags 或不可用的完整状态使保留状态失效；按下后不能安全释放则关闭本账号连接。发送失败关闭，调度停顿超过250毫秒不补发延迟动作，停止或保护要求也正常关闭传输。至多一次，不为保持活跃循环按键。

## 观察语义

`tickPacketsSent` 只表示原生发送返回成功，最多3。`wakePressSent`、`wakeReleaseSent` 分开记录；按下后五秒内接到同实体、更大有序序号、可用自身完整状态且 Sleeping 清除，才设置 `wakeAwakeObserved`。`awake_observed` 还要求释放完成。超时 `unconfirmed`；初始已清醒为 `already_awake` 且不发输入。页面与账号日志区分上述结果；私有坐标、标识和完整模型不进入 HTTP 元数据。

这些快照是发送后的观察，不能单凭时间先后证明因果，也不代表有效 EAC、Facepunch 后台资格或社区列表人数增加。本次完成一次唤醒输入实现，不包含持续 Tick 保活、移动、碰撞/地形模拟或完整游戏客户端；真实服务器唤醒尚未实测。

## 验证证据

- 已有官方客户端抓包：基线1363、重连5154，共6517个出站未分片 Tick，均为可靠性3、通道0；只读取既有抓包，没有重放网络或认证材料。
- 从旧重连抓包离线匹配29份自身完整快照，15份满足当前静态状态构造条件（清醒11、睡眠4），其余因坐骑、运动/模型或玩家门控拒绝。该分析不证明实时接收时序或本次已唤醒；原始自身数据只保存在 ignored work。
- Python 状态机15项、worker生命周期8项、Node完整38项全部通过。状态机覆盖真实完整消息的默认零省略、旧 pose 保留、输入中立/按下/释放、未确认超时、外来/旧/替换实体、状态失效、延迟调度与失败后不重试；释放失败后的关闭仍保留失败状态。
- Python worker 假原生 API 测试覆盖完整身份→批准→Ready→自身实体→FinishLoading→三帧→清醒快照→关闭，以及按下后校正关闭、启用唤醒时仍拒绝 EAC/加密、原有拒绝分类和清理。
- `PlayerTickInterop.cs` 用本机原版 Rust.Data 的真实 Deserialize(isDelta=true) 和 Serialize 验证3帧、81条断言。解码前所有支持字段填入非零值，验证零按键/向量/物品/父实体被正确覆盖、pose11保留以及重建后可完整序列化。Rust.Data SHA256：`1d62baef9b339f0416e6529618365c1ecad01791a833e77e76eb6c8464406104`。脚本输出到 ignored work，并核验输入程序集未改变；不启动游戏、不打开网络。
- Node 测试覆盖开关传递、默认关闭、严格类型、元数据过滤、最终消息之后到 worker 真正关闭之前继续保有 Steam 票据租约，以及原有服务功能回归。

复核命令：仓库根目录运行 `python -B tools/rust-research/test_rust_player_tick.py`、`python -B tools/rust-research/test_rust_peer.py`；`steam-multi-account` 内运行 `npm.cmd test`；.NET 10 环境运行 `tools/rust-research/Test-PlayerTickInterop.ps1 -ServerDirectory <本机Rust服务端目录>`。运行日志和程序集保留在 ignored work，不提交账号资料或抓包。
