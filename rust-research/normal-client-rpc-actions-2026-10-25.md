# 正常客户端31条出站RPC的分类

2026-10-25。本次离线分析补充了上一轮官方客户端的动作证据：18:13:00–18:14:32北京时间捕获到的31条唯一出站RPC，按函数哈希分为8类。它们覆盖攻击、落地、拾取、信号及状态查询，当前独立程序尚未实现这些完整游戏流程。

| 方法名 | 请求数 | 名称所示用途 |
| --- | --- | --- |
| OnProjectileAttack | 1 | 投射物攻击上报 |
| BroadcastSignalFromClient | 13 | 客户端实体信号请求 |
| OnPlayerLanded | 1 | 落地通知 |
| OnProjectileUpdate | 1 | 投射物更新 |
| Pickup | 1 | 拾取请求 |
| CLProject | 1 | 保留方法原名，具体目标未确认 |
| RequestAnimalStats | 6 | 动物状态查询 |
| PlayerAttack | 7 | 近战攻击请求 |

从原始包再次按RustClient实际套接字和目标游戏地址过滤、按可靠帧序号去重。仅读RPC固定函数哈希，不导出实体标识或参数体，不发送、重放或执行消息。总数与前次31条统计一致；旧抓包和前次证据均未修改。

使用dnlib离线读取现有服务端Assembly-CSharp.dll的23,895个唯一方法名，按已核实的ManifestHash算法计算候选。8个哈希均有RPC_Server标记的方法名匹配；12个匹配声明体现了同名方法共享哈希。程序集MVID与当前目标及抓包前目标观察均相同，SHA见JSON。游戏程序集没有被加载执行。

Pickup可匹配CollectibleEntity、RFTimedExplosive、WorldItem；CLProject可匹配BaseMelee或BaseProjectile；RequestAnimalStats可匹配ChickenCoop或LivestockAnimal。本次没有推断具体接收实体或每条请求执行成功，状态查询也不代表每次都有用户主动按键。

本报告证明真实客户端发送过这些请求，未证明攻击命中、成功拾取或公共人数资格。它分析的是上一轮手动游玩，不替代当前重复实验的活动证据，也未向独立程序添加自动攻击、循环动作、虚假上报或EAC实现。

原始记录仅保留在ignored work目录；同名JSON包含安全分类、元数据匹配及10份证据SHA。
