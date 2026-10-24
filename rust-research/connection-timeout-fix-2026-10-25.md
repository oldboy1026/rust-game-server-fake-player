# 首帧 PlayerTick 后约62秒断开的修复

2026-10-25 用户反馈：新增一次唤醒后，入服很快显示“服务器拒绝了本次连接”，旧版本则能保持较久。本批修复连接维护遗漏，并使用一个账号完成了超过原断开点的真实回归。有效 EAC 和公共列表人数不在本批验证结论内。

## 原因和证据

当前服务端代码 `BasePlayer.timeSinceLastTick` 在 `lastTickTime=0` 时返回0；`PlayerInit` 会重置该字段。旧程序完全没有 PlayerTick，因此没有启动这条玩家响应超时计时。首次有效 PlayerTick 后，`OnReceiveTick` 更新 `lastTickTime`，随后若不再有有效响应，`ServerKickUnresponsivePlayers` 会对非 ReceivingSnapshot、Alive 且 `timeSinceLastTick > server.playertimeout` 的玩家执行 `Kick("Unresponsive")`。睡眠不在这条踢人条件的豁免范围。

读取本机现存会话历史：三次入服后断开分别为62.875、62.234、62.672秒。其中一次确实发送3帧并观察到清醒，另两次只有1帧并中断；不能将它们都写成唤醒失败。另有一次约1.657秒的 Steam 认证拒绝，管理日志支持 `AuthTicketAlreadyUsed`，它是不同原因。原三次记录被旧分类器归入 unknown，未取得对应原始拒绝文本；超时解释由静态条件、只读配置和下方回归共同支持，不能声称原三次都已从管理日志直接看到 Unresponsive。

服务端还提供普通、无参数且 `[RPC_Server.FromOwner]` 的 `ClientKeepConnectionAlive`，只更新 `lastTickTime`。RPC 分派到 handler 之前，`BaseEntity.SV_RPCMessage` 会按 `rpcstallmode` 检查 `isStalled`；Alive 且非 Sleeping、没有临时保护、首帧之后间隔超过 `rpcstallthreshold` 时，RPC直接被丢弃。发送端原生返回成功不代表 handler 被执行。

2026-10-24 17:38:11 UTC（北京时间10月25日01:38:11）只读查询目标配置：`server.playertimeout=60`、`antihack.rpcstallmode=1`、`antihack.rpcstallthreshold=0.8`、`antihack.rpcstallfade=2.5`。本批未更改这些门槛或同IP连接上限。

## 修改

- 启用 `wakeOnConnect` 且已发送首帧之后，维护与唤醒状态机独立。向本连接自身实体发送普通 owner RPC，不重放旧坐标或持续按键，不改认证或公开人数上报。
- 维护设计间隔100毫秒。每两秒一次的候选方案曾真实失败：唤醒成功但62.266秒断开，符合 RPC stall 门槛；该失败记录保留，未算作通过。
- 本机维护间隔超过500毫秒时关闭自己的连接并提示重新连接，不补发积压消息；原生发送失败也关闭。自定义服务端更严门槛、网络延迟和进程停顿仍可能断开，不能保证无限期留服。
- 已核对的 UI/宠物元数据 RPC、位置完全相同的无父实体同步回包不再无条件打断唤醒。严格解析独立视角回包；不以这些局部回包刷新完整模型状态年龄。未知自身 RPC、真正的位移、父实体/坐骑或不可用状态继续停止输入；无法安全释放时关闭本连接。
- 新错误分类区分玩家响应超时、票据被占用和未知入服后断开；维护中断保留明确状态。HTTP 元数据只保留计数、布尔值、固定中断分类和可选方法ID，不暴露坐标、玩家标识或原始拒绝文本。
- 继续拒绝 EAC 和非零加密要求；没有启动官方客户端、建立有效 EAC 会话或修改服务端安全配置。

## 验证和运行状态

最终代码：Python状态/维护21项、worker生命周期12项、Node完整40项通过。模拟接收端新增0.8秒RPC门槛：旧两秒节奏原生发送全部成功仍会被丢弃并在60秒后断开；正确节奏在清醒状态下超过80秒无超时。保留中断唤醒、真正校正后关闭、EAC/加密拒绝和票据清理回归。真实 Rust.Data 的3帧/81断言互操作检查已在本轮前段通过，之后未改 Tick 编码器。

真实单账号窗口为17:39:53.959–17:41:20.204 UTC（北京时间01:39:53–01:41:20）。2.156秒时已观察到三帧完成、`wakeState=awake_observed`、自身 Sleeping 清除；最后一次82.156秒状态仍为 entered_game，发送总数738，其中普通输入仍仅3帧。轮询首次观察到 Tick 后继续观察80.187秒，共18份样本，没有复现62秒断开。末次生命/睡眠字段仍是最近自身快照的观察值，不能当成该秒服务端重新确认。测试随后按自己创建的 startedAt 精确匹配正常停止，确认传输closed且票据available=true/active=false。没有做39账号批量连接、公共人数或无限时长测试。

结束后只读复核：39个Steam账号在线、Rust活动连接0。本次测试没有待清理连接、票据或配置回滚。私有driver、账号/管理配置和原始证据留在ignored work；公开摘要和SHA256见同名JSON。

新建Python worker已读取修复后的网络代码，现有运行会话不会自动升级。后端重启被自动审批拦截，工具仅返回 `rejected: blocked by policy`，未给具体原因，未执行重启；当前3210服务仍为PID13504。因此新版Node错误分类、维护计数及日志提示尚未加载，旧页面遇新分类可能仍显示笼统信息。不要用其他命令绕过同一被拒重启动作。
