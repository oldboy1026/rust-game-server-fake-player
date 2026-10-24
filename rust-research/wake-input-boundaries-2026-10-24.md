# 普通唤醒输入的边界复核（2026-10-24）

现有证据还不足以发送一个完整、可正常收尾的 wake Tick 序列，也没有证明它能修复游戏列表人数。本轮仅静态读取当前本地程序集及客户端文件，没有发送 Tick、操作账号或服务器、改配置或运行测试套件。

新一轮按当前文件哈希重新核对了首帧合并语义：`ProtoDelta` 先复制旧基线，缺字段继续保留旧值；空 Input、ModelState 或 Vector3 子消息不会可靠地清零旧状态。ModelState 构造时 flags=4，回收到池时却置0，因此也不能把空对象固定解释为4。当前 Facepunch.Network 的 ProtoDelta token 是 `060000CD`，旧摘录中的 `060000D3` 不能与当前哈希混用。

服务端睡眠分支在有效按键边沿后调用 EndSleeping 并提前返回，但发送前已醒的竞态，以及唤醒后的释放帧，都会进入正常位置处理。RecordPacket 还可能在睡眠分支之前完整序列化 Tick，而该序列化要求 InputMessage 与 ModelState 均存在。仅补输入字段不能构成完整流程。

`player.wakeup` 注册为 `ServerAdmin=true`、`ServerUser=false`，外层权限首先要求 RCON 或有效管理连接。方法内部还要求调用者为管理员、开发者，或服务器处于 cinematic，并按参数查找指定睡眠玩家；它既不是普通玩家的自身唤醒命令，cinematic 也不能绕过外层权限。普通已认证游戏连接不会因此得到管理权限。未尝试用 RCON 替代调用者或修改权限。

真实位置、父级、姿势和眼位的来源仍需闭合。已有[客户端静态报告](client-tick-static-followup-2026-10-24.json)确认位置来自 localPosition，眼位来自相机或 PlayerEyes；零眼位没有依据。此次虽定位到 NETSND_Send 的客户端导入包装，仍未建立 Tick 至最终 RakNet 的可靠性、优先级、通道及节奏，不能套用身份消息的发送参数。

下一步先补纯接收的自身完整状态与序号/时效，再核对首帧覆盖和真正发送路径；当前不应盲发纯 Input 两帧。方法 token、程序集哈希、原始摘录相对路径及 SHA256 见[脱敏证据](wake-input-boundaries-2026-10-24.json)。原始 IL 保留在 ignored 目录。
