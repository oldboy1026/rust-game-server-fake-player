# 换电脑后的接续说明

最后整理日期：2026-10-25，Asia/Shanghai。

## 2026-10-25：14个用户连接已持续复核，下一步只读返回值诊断包待上传

用户要求继续研究公共8。02:24–02:37北京时间只读检查；14个研究账号均在服，原startedAt不变、票据active且验证已观察。Steam CM auth_players初21末22，等于真实服务端人数；不是Steam只认证8。18:27:07–18:37:08 UTC完成601.194秒/11样本/33来源全部成功：研究14恒定，其他7→8，活跃/cp21→22，rawTickRatePositive7→8；公共文件新批次18:23:06为8、18:28:07为7、18:33:07为8。仅一个其他身份自然加入，无研究身份增减。18:32的cp少1下一份恢复，符合发布周期。公共与其他/raw/IP数相等仍是相关性，不是后台公式。

研究worker仍只发入服1–3帧：5个wake awake_observed、9个interrupted；末次累计帧不变。owner保活只更新lastTickTime、不增加raw tick，持续普通输入缺口是线索，未证明“发Tick即可被计数”，不要循环旧姿态/按键补造活跃或上报。历史12自然样本uniqueIP10/11而公共7/9，无逐份相等；不能宣称按IP简单去重。上报stats增加5事件/857 Uploaded Bytes、队列0、dryrun false，但不等于后台逐账号采纳。没有改配置/Flush/创建或停止连接；当前IP上限50为只读看到的用户状态，不擅自恢复5。

完整报告 `rust-research/fourteen-session-count-investigation-2026-10-25.md/.json`。本次诊断工具中目标已有PlayerCountProbe，尚无返回值观察器和桥。重新编译已有ReportingObserverFocused DLL与ObserverStateBridge，成功且输入未变；Steamworks MVID守卫匹配，仍未部署/加载或验证Mono。用户输出在 `C:/Users/Administrator/Documents/Codex/2026-10-24/new-chat/outputs/人数差异诊断-20261025.zip`（7文件哈希已校验，含20身份私有配置，不入Git）。RCON无文件上传能力，需用户把包内3个部署文件按说明上传，再继续；不得把准备包当已安装。

用户回复上传后：先读取当前14会话与bridge状态，官方load ReportingObserverFocused，最多180秒观察BUpdateUserData原始bool；必要时仅用私有 `work/count-feed-observer-candidates-private.json` 中一个当时确无活动会话的账号正常新建，精确startedAt清理本轮连接，保留所有用户既有连接。然后官方unload并核对同一startedUtc unloaded=true/patchInstalled=false，移出本次DLL/私有配置。源码及详细流程见报告/输出说明；180秒不自动卸载。当前没有已加载观察器或待清理测试连接/配置义务，Node未重启。

## 2026-10-25：三个用户连接已计入cp，DLL重写cp不能解释公共差异

用户询问能否编DLL按 `mp{maxplayers},cp{activePlayerList.Count}` 更新真实在线人数。本批仅只读分析，没有实现/部署DLL、改配置、创建或停止玩家连接。01:55:32–01:56:49北京时间：本机3个entered已持续422–432秒；服务端两份名单12人，三个账号全部存在、其他9人，身份集合不变。真实Probe active/alive/connected/networkConnected/networkAuthenticated各12，sleeping1、ReceivingSnapshot0。两次相隔35秒A2S均players14/cp12/bots0，Facepunch公共人数均8且为同一Last-Modified=17:53:06 UTC缓存批次，不能称新后台独立刷新。

原版本来每30秒发布活跃数，当前cp已等于服务端真实人数。普通列表可信上限适用时 `max(0,min(cp,trusted))`，这些输入为8；本轮未观察真实游戏屏幕或运行时开关。DLL单纯写同一cp12不能指定公共返回值。A2S额外2人原因、Facepunch逐账号资格及上报与采纳因果仍未知；不要把睡眠/EAC直接当唯一原因，或宣称三个账号都没被采纳。详见 `rust-research/cp-dll-assessment-2026-10-25.md/.json`。保留三个用户已有连接，本批无回滚义务。

## 2026-10-25：已修复首帧后的超时回归，单账号超过原62秒断开点

用户反馈新唤醒后约一分钟提示拒绝连接。原因是第一帧Tick启动 `lastTickTime` 超时，而原三帧后无维护。目标只读确认 `server.playertimeout=60`，另有RPC接收门槛 `rpcstallmode=1/rpcstallthreshold=0.8/rpcstallfade=2.5`。最初每2秒owner维护仍因stall门槛失败，唤醒成功也62.266秒断开；该失败没有当作通过。最终设计100毫秒发送普通无参数 `ClientKeepConnectionAlive`，与唤醒中断/完成独立，本机间隔超过500毫秒或发送失败正常关闭，不补burst、不循环旧坐标/按键。

真实回归17:39:53.959–17:41:20.204 UTC：一个已有在线Steam账号正常连接，2.156秒观察到3帧完成与Sleeping清除，82.156秒仍entered_game；首次观测Tick后保持80.187秒，未再62秒断开。finally只按自己startedAt清理，closed且票据available=true/active=false。结束只读39Steam online、0活动Rust连接，没有本批清理或配置回滚义务。Python21+12、Node40项通过；早前本轮真实Rust.Data互操作3帧/81断言通过，之后未改Tick编码。报告 `rust-research/connection-timeout-fix-2026-10-25.md/.json`。

同时允许已核对的UI/pet RPC、位置不变回显继续三帧；真正校正、未知自身变化仍停止或关闭。新增玩家响应超时、AuthTicketAlreadyUsed和维护中断的固定错误分类。原三次62秒记录中一次已清醒，并非全部只有1帧；另有认证占用属于独立原因。原unknown记录无对应原始拒绝文本，不能宣称逐条从管理日志确认Unresponsive。没有有效EAC、公共人数或全账号压力验证，不改服务端反作弊/超时/IP上限。

**部署限制：Python新建worker已生效。Node后端重启被自动审批拦截（仅返回rejected: blocked by policy，无具体原因），整条未执行，当前3210仍PID13504。不得通过替代命令绕过同一被拒动作。新版Node分类/维护计数/日志提示尚未加载，旧UI仍可能显示笼统信息。** 不要把旧Node丢弃的新分类字段当作正常断开的证据。下方初次实现“没有真实唤醒实测”为历史状态。后续如需服务重启，须按当时授权与阻拦处理，不能宣称本轮已重启。

## 2026-10-25：用户重新启动独立程序开发，新增一次 PlayerTick 唤醒

本轮直接指示优先于下方归档停止记录。用户已选择“保持独立程序，先完成 PlayerTick 与唤醒”，本轮不实现官方客户端模式或 EAC。新增 worker `--wake-on-connect`、API 严格布尔 `wakeOnConnect`（默认关闭）、两个页面的“入服后尝试唤醒一次”与过滤后的进度状态。

实现为有条件的三帧普通输入（0→64→0），不是持续移动模拟；完整 ProtoDelta 显式覆盖零值，按可靠有序通道 0 发送。只用新鲜、有序、存活、静止接地、无父级/坐骑的自身完整状态，按键后观察同实体更新快照的 Sleeping 清除；未知自身状态改变停止，无法释放时关闭自己的连接。见 `rust-research/player-tick-wake-2026-10-25.md` 与服务 README。

本批只做离线测试、读取现有抓包和管理程序集；没有真实账号连接、游戏启动、服务器配置修改或服务重启。旧服务需要重启才能接受新 API 选项，运行中的旧 worker 不会自动升级。真实服务器唤醒、有效 EAC 与公共可信人数效果均未验证，不能按离线发送或反序列化通过宣称已完成这些实测。

## 最终归档：用户要求保存推送并结束研究

**先读 `rust-research/FINAL-ARCHIVE-2026-10-24.md` 与同名 JSON。** 用户已明确结束本轮，不继续实验或自动恢复账号；下文中的“明日继续”“当前进行中”等为历史快照。全部已跟踪代码、报告和工具在最终 JSON 中有文件分类、大小和 SHA256；私有资料仍留本机 ignored 目录。

公共列表人数没有验证修复，Facepunch 后台规则未知，有效 EAC 会话未实现。最后 NPC 请求仅产生只读设计与静态资料，没有实现账号聊天、移动、AI 核心或插件；见 `npc-ai-design-status-2026-10-24.md`。

旧批量实验收尾及恢复5在下节有时间戳证据。**归档时19:05:11北京时间的新本机快照为39Steam online、2Rust entered_game/37error、票据2active/37inactive、批量任务0。** 两个入服会话开始于旧driver结束后，且不匹配其新建startedAt；保留现有会话，归档未重登、断开、改服务端配置或重启任何游戏/服务。不得把下方18:27时的0连接当成归档时实时状态。该快照不是后续状态保证。

交付以最终 Git 提交与远端分支一致为完成标准；本轮不安排后续实验、提醒或自动任务。

## 最新已完成：批量观察中断收尾，上限 5、研究 Rust 连接 0

本批结果见 `rust-research/bulk-count-observation-2026-10-24.md`。用户明确回复 Rust 列表显示 **13 人**，与同期公共接口一致；不是 38 个研究连接被计入的证据。3 个原有连接保留、另 36 个正常单次尝试，35 个成功、1 个认证拒绝后停止。满 38 在服的首末有效采样为 10:06:41.153–10:10:12.304 UTC，跨度 211.151 秒；10:10:42 开始全部停止，不能声称完成 20 分钟在服窗口。

39 个 Steam 账号在 10:10:40.490–10:10:40.507 同步进入 reconnecting，游戏传输和管理通道也失联，没有新应用层拒绝原因消息。用户随后确认当时电脑 Wi-Fi 断网，与共同失联一致；不要归因于服务器踢人或连接上限，精确网络事件先后未测。其他玩家身份集合变化，公共 12→13→14→15 不可归因研究账号，后两次变化时研究连接已为零。原 Probe.other 混有研究账号，全研究人数以私有 39 身份集合核对 RCON。

**10:20:15.817 UTC 独立工具已将连接上限 50 恢复 5 并读回确认。** driver 于 10:26:47.772 自然结束、49样本、退出0，finally读回原值，rollbackRequired/rollbackPending均false。10:27:14独立一次只读复核再次确认真实上限5、RCON研究0/其他15、API entered0、39原生封装已关闭。Steam39均已恢复online，39票据available=true/active=false；36个本轮新startedAt精确匹配、无替换或活动会话。不存在待恢复的临时配置或本轮活动Rust连接。证据在 ignored `work/bulk-restore-guard-safe.json`、`work/bulk-count-review/final-check-safe.json`，公开聚合与SHA见本报告JSON。不要为公共列表人数再次执行批量入服、补造活跃或认证/人数上报。

票据审计注意：`activeSessionStatus()` 在离线时返回 available=false、active=false；原 driver 的 ticketInactive/closed_ticket_inactive 未检查 available，因此不能把这些旧字段当作每张票据取消已确认。补充核验必须分别记录可观测性；当前可读且为空也不是过去取消回执。Rust传输已停止与本地票据取消确认是不同证据。

Steam层有自动恢复，Rust层没有自动重连；不要为核验票据强制重登或重启服务。网页保持运行，正常Rust客户端及本地测试服未改动。后续仅排查真实玩家统计一致性、共同断线与诊断准确性，不伪装虚拟连接为真实玩家来放大公开人数。原始资料不公开；本批报告完成后按仓库要求提交、推送并核对远端SHA。

并行离线接收候选归档在 ignored `work/wake-tick-candidate/receive-candidate-audit.md` 与 safe JSON，13组合成/500随机通过，但不兼容正常Alive快照默认字段省略，当前实际不可用。未接入worker、部署或发送；不能把该候选当作正常输入/人数资格的已验证功能。公开报告只记录负面结论和证据哈希。

## 历史：用户授权临时 50 后的批量观察启动记录

用户已明确回复“允许临时改为50，结束恢复5”，这是当前授权，不再询问。10:03:14 UTC（北京时间18:03）开始运行私有 `work/probe-bulk-cycle.mjs --approved-temporary-limit-50`，已读回初值5及临时50；**目前有恢复5与本轮新连接清理义务**。原有3个用户连接保留，其他账号5秒间隔单次正常连接，连接settle后完整观察1200秒，主流程上限1800秒。不要把下方旧“待确认/未执行”记录当作当前状态。

活动记录 `work/probe-bulk-cycle-state.json` 与 `work/probe-bulk-cycle-ownership-private.json` 均被忽略；后者含每账号精确startedAt归属和rollbackRequired。若接续时进程已退出，先读这些记录并确认真实RCON上限；仍需恢复时按已批准的5进行，不重新索取许可。只清理本轮owned且当前startedAt一致的会话，用户替换和原有3会话保留。脚本finally先恢复5并读回，再清理本轮会话；最终还需独立只读RCON名单与API核对，不能只凭driver.completedAt宣告成功。

初始完整基线：研究3、非研究14、公共trusted12。Probe仍只focus原3身份，其他36研究账号也在probe.other中；完整研究人数按私有39身份集合匹配RCON。当前sourceOk[0]同时涵盖Probe和RCON，API还须核read39/failed0，公开批次时间与查询时间分别记录。主观UI显示尚待核对，不能把公共API读数写成已看到游戏截图。结束后固定证据、更新本节为实际结果并提交推送Gitee。

## 最新：目标 Probe 已运行；批量拒绝错误已修复，同 IP 上限变更待确认

用户已上传 `PlayerCountProbe.cs`，08:52:00 UTC 真正返回 version0.1.0/monitoring=true/sample成功；08:53私有配置原3研究身份。实际目标 secure=false/encryption0、Steam登录后台、EAC接口false；初始13连接均缓存已认证及原raw速率>0，真实可选输入hook有观测。不能再把本地hook未观察推广远端，也不能把EAC缓存值当受保护会话。详见 `rust-research/playercount-probe-target-2026-10-24.md/.json`。

09:03:11开始原单账号正常入服，09:12:53持久RCON恢复后明确观测focus active/alive/sleeping/connected/networkAuthenticated各1，真实Steam回调OK1，input0/raw速率0；其他连接确有输入。09:15起用户又手动接入新账号，单账号因果设计已混杂。管理采样曾缺失，旧两socket反复握手已停止；不能确证当时是RCON限流。原账号09:18:11正常停止，票据inactive；20份离服RCON均确认selected不存在，09:28:12观察自然完成。可信多个批次一直11，不能称已修复。

用户随后导入大量账号，最新09:34:56 UTC确认39个Steam在线、3个用户保有的Rust entered、0connecting。我们的原账号和09:29三次有限回归均已停止且票据inactive；不要擅自清理这3个已有用户连接。原Probe focus只有原3身份；后来未focus研究账号也在Probe.other内，other绝不自动是真人。全39总人数需要用本地私有集合逐行比对RCON，而不能只看focus。

新增发现：目标实际 `server.maxconnectionsperip=5`（09:21:34只读确认），限制同一源IP的同时游戏连接数且含认证前连接，超限在RequestUserInformation前拒绝；不同源端口和错开连接不能突破。它与Fleck/WebRCON的管理连接上限是两项设置。用户要求全账号观察15–30分钟，已通过异步问题询问临时改50、观察20分钟后恢复5；**目前尚未回复，未改配置、未执行39账号批量脚本。** 不得将时间流逝当批准。

私有 `work/probe-bulk-cycle.mjs` 已语法/静态核对，必须明确授权后才用 `--approved-temporary-limit-50` 执行：39在线唯一身份，单持久RCON队列，5秒错开单次正常尝试，最后握手有限settle再观察1200秒，主流程30分钟上限，已有用户会话保留。创建/cleanup按精确startedAt所有权；finally核对当前值仍50才恢复5并验证，别人改过的值不覆盖且明确pending。每次执行前核对当前账号数及是否已有ownership ledger，不能覆盖未完成回滚记录。脚本和所有私有配置留ignored，不要输出管理端点。

用户看到的“不完整关闭结果”另有确定程序错误：DisconnectReason已带category emit后，循环尾重复无category emit导致KeyError。已修复 `rust-peer.py`（SHA45d62cd324fb0d18f83a9555f2f8b2046486873e64e88d9b905172724113e5fa）；5组11离线路径、4项合成父进程集成、Node35项通过。09:29:26–52真实三次验证1入world、2明确限制拒绝，均已清理，不再被重复事件异常覆盖。新worker已使用修复；父进程单行“同IP数量或频率”新文案未重载，当前Node仍显示旧“频率”字样，未重启3个用户进程。见 `worker-rejection-fix-2026-10-24.md/.json`。

独立 `ObserverStateBridge.cs` 与构建/中文说明已新增tools/rust-research，真实引用编译+同源5组65断言通过，未上传/运行。它只读固定自写Observer状态schema，不碰Probe epoch。第二阶段outputs候选目录已备桥源码和自写 `ReportingObserverFocused.dll`，未配置/上传/加载，不是人数修复。原未知FakePlayers.dll仍未执行。MVID相同不能证明全部二进制字节相同。

Rust正常客户端窗口存在，但computer-use两次抓图均超时，未取得本轮实际社区列表截图；不能把公共API结果称作已人工核对UI。仅激活窗口、没有点击/断开用户正常游戏。当前API/后台采样可用，Web保持运行。本批公开更新须正常提交、推Gitee并核远端SHA；后续以最新记录为准。

## 历史：第一阶段源码准备完成，尚待首次上传时的记录

用户新确认可上传 `oxide/plugins` 与 `HarmonyMods`。不要继续把“仅RCON、不能上传”作为当前限制；但截至本批记录，实际远端文件尚未上传/加载。已向用户提供outputs/目标服只读诊断包中的 `PlayerCountProbe.cs`，请先只上传此源码到 `oxide/plugins/`，无需重启；用户回复已上传后由我们通过已有私有RCON确认 `playercountprobe.snapshot`，不要求用户提供管理ID。

源码、构建与文档在tools/rust-research，报告 `playercount-probe-preparation-2026-10-24.md/.json`。Probe按内存focus/other/unclassified分组，读取真实安全/Steam/EAC/活跃与网络/生命和睡眠、原raw tick速率及可选输入hook。other不自动是真人，inputHookObserved=false不证明没发输入。focus仅RCON、最多20身份、改变会创建新epoch，参数不由插件落盘/回显但外围RCON审计可能记录。独立静态复核、真实17引用编译及同源stub13组339断言（38回复扫描）通过；尚无真实目标运行或人数效果。

另备独立 `ReportingObserverFocused.cs`：原BUpdateUserData返回按actor身份分类，180秒截止，拒绝既有补丁，精确卸载，坏/无配置全部unclassified；真实引用编译与官方Harmony/CLR4同源11组219断言通过。先取得目标信息再决定第二阶段部署，不能把本机MVID/SHA与真实Mono效果当已验证；旧Observer与证据未改。

私有后续控制工具 `work/playercount-probe-control.mjs snapshot|focus` 已语法复核、未执行；focus模式先验证真实probe运行，再从当前本机在线账号读取身份配置分组，不输出身份，原始回包仅ignored。08:27:48 UTC只读基线目标version及Oxide响应（2.0.7839），尚未匹配probe命令。当前无新玩家连接、配置改变或远端插件卸载义务。下一步先等待实际上传状态，不把准备包当已部署。

## 最新：公共人数查询/上报深扫与本地实际安全状态

当前仍未验证修复公共游戏列表人数。先读 `rust-research/count-query-reporting-deep-2026-10-24.md`，它整合本批新增证据与下一阶段条件。客户端已补齐成功映射→integration通知→已启用列表应用/dirty链，不能再用“没有刷新通知”解释；请求前门槛为PublicKey，与ApiUrl getter分离，已修正旧显示证据JSON的措辞。后台资格算法不在已取得的本地文件中。

服务端深扫12模块/313方法/333调用及266模块补充扫描，确认正常注册、帧callback泵及原生边界；ForceHeartbeat当前只有ret，相同元数据有缓存跳写，但未观察缓存失配，不得据此强制重发。详见 `count-server-deep-2026-10-24.json`。

15:49:36–15:55:08只读12次并行采样：cp逐份等于RCON11→12→11；A2S多2或3且bots0，较早基线差4，不能写固定+2。trusted新批次7→9，研究Rust始终0，名单集合2次变化，不能归因研究账号。匿名GMS超时、另一个列表未返回目标，缺失不是0或未注册。见 `count-chain-observation-2026-10-24.md/.json`。

15:50:18官方加载自写无patch的CountSnapshot单次聚合，确认本地Steam已登录，但effectiveSecure=false/encryption1、EAC接口false/句柄0，缓存IsAuthenticated却为1；active/alive/awake/connected各1。这个本地服不能作有效EAC对照，旧本地加密拒绝也不是EAC认证结果。源码真实引用编译通过、独立静态复核，无配置/玩家操作；15:50:19已卸载并移出复制DLL。final复写同次缓存，不是第二次状态采样。前后RCON同一1连接、时长覆盖窗口。见 `count-snapshot-local-2026-10-24.md/.json` 和 `tools/rust-research/CountSnapshot.md`。

旧gameplay实验七份原始uploader记录已复核：DryRun=False，Null/Azure序列化0，仅FP有流，支持旧HTTP成功状态推断，但不是后台采用回执。uploaderstats Total Bytes是序列化字节，Upload Task可能吞网络异常后正常完成，不得仅凭Task/总体字节宣告成功。见 `count-upload-window-audit-2026-10-24.json`。

Web保持运行，3Steam在线、0研究Rust活动连接，正常RustClient/本地服均保留。本批有限观察已完成，无卸载/票据/配置回滚义务。远端仍只有RCON无法部署新DLL；下一步优先取得已登记服正规诊断部署和版本核对，关联真实Steam/EAC/token/具体上传生命周期；无需先购买服务器，不能通过本地非secure连接或反复Flush推导公共资格。

## 最新：自写Harmony诊断DLL已在本地实际验证并卸载

15:28:44–15:28:53在用户本地服使用官方 `harmony.load/unload` 完成有限观察，不重启、不改配置/人数/认证，不执行未知FakePlayers.dll。自写 `ReportingObserver.cs` 精确锁定当前Steamworks MVID与bool方法签名，拒绝已有目标补丁，仅观察值参数返回与是否执行原方法。源码和构建DLL的SHA及结果见 `reporting-observer-local-2026-10-24.md/.json`；构建工具/说明随源码保存。

加载前基线0次，窗口内包装正常返回1次true、0次false，写入错误0；卸载状态unloaded、patchInstalled=false，本次DLL按SHA匹配后移出HarmonyMods。一个研究账号尝试本地正常连接，收到Approved后遇受保护加密要求，1.61秒正常停止，未发Ready/respawn/Tick、未入世界，票据inactive。stopRequired/unloadRequired均false。当前3Steam在线、Rust活动连接0（一个历史error、两个closed），网页保持运行。用户正常RustClient保留，本地另有一个非研究连接；没有重启或断开它。

源码真实引用编译通过；官方Harmony+自编玩具目标在系统CLR4完成8组38断言，结果/原异常/finally保持、截止后不计数、跳过原方法分类、精确卸载保留第三方补丁。详见 `reporting-observer-isolation-2026-10-24.md/.json`。另保留.NET10不兼容失败记录；不要改写成所有运行时通用。源代码具有单调时钟180秒上限，但本地短窗口未实测完整180秒。异步最终快照落盘后才进行下一加载，防止旧实例覆盖新文件。

该true仅补齐了被外层void丢弃的本地方法返回值；发生在后续EAC流程之前，不能证明最终准入或可信人数。观察器不记录回调身份，不能仅按计数直接单账号归因；不能将本地结论推广远端。当前目标服仍只有RCON、没有本轮文件部署，所以暂无其真实bool和认证生命周期证据。这是只读诊断DLL，不是人数修复插件。后续优先取得目标运行服正常返回、实际保护状态及后台收录证据，不能凭成功返回反复补发资料/事件。

15:30只读核对本地仍1个非研究连接，与15:15/15:18身份集合相同且报告时长覆盖观察窗口，未见人群增减。安全集合/时长比较已嵌入本地观察JSON；不能替代回调身份关联、完整连续观测或公共资格回执。

## 最新：Rust批量页面与服务端正常上报路径

用户将重点转到服务端文件/网络交互，同时要求独立Rust账号页面。新增 `/rust`：直接显示账号名、多选登录/连接/断开、服务器名称分组与本系统人数、每账号日志、每行账号:密码导入。新账号验证码/错误/超时会停止并移出，已有记录保留；磁盘故障无法保存清理时明确报告。密码不进任务/日志/存储。日志最近200条、任务最多20批，仅内存保留，服务重启后Rust连接需重新发起。页面人数不代表公共可信人数。详情见 `rust-research/rust-workspace-2026-10-24.md` 与服务README。

新增6项隔离测试，完整 `npm.cmd test` 35项通过。3211模拟服务浏览器验证了分组选择、独立日志、导入成功/验证码跳过/错误移出、批量断开2→0和连接0→2；轮询改为保留按钮/复选框节点，避免点击及焦点丢失。模拟数据不是真实研究证据。

15:11完整实验结束后已正常重启正式服务，新 `/rust` 和 API 已上线，health成功、页面200，3个Steam账号online、3个Rust会话closed，未自动重新入服。已打开并解锁正式页面，只核对汇总数字，不公开账号信息。3211模拟服务和临时页面已关闭；正式服务输出重定向ignored日志。

新服务端报告 `server-reporting-paths-2026-10-24.md/.json` 重新核对7模块：正常Steam认证→玩家资料更新→BUpdateUserData，包装丢弃bool；cp周期取实际活跃人数；真实analytics事件及批次调度分别存在。`Flush()`仅改到期时间，不造事件或保证可信人数。只读 `ReportingDiagnostics.cs` 订阅真实Steam回调与采样缓存cp，已离线编译并用stub隔离验证，未部署；它不补发、不Flush、不改人数/EAC。有效EAC与公共收录仍未闭环，不能宣告修复。未知FakePlayers.dll仍未执行。

后续优先补正常生命周期事件及原始资料更新返回值的实际观察，先确认插件框架在运行进程中可用，再部署经过审查的只读源码；不要把复制到未加载的目录当作安装成功。远端仍只有RCON，用户没有文件上传渠道。原始身份/管理凭据/流量均留ignored，不公开管理端点。

15:06–15:08本地只读核验：version正常返回2635.289.1，oxide.version/oxide.plugins超时，find oxide和find countdiag返回空命令索引，原生配置命令索引正常；当前启动日志未见Oxide。因此尚未证实本地当前进程能加载Oxide源码插件，未安装、下载框架或重启。本轮只读插件真实引用离线编译通过，自建stub11组96断言通过，详见 `reporting-diagnostics-build-2026-10-24.json` 与 `reporting-diagnostics-local-framework-2026-10-24.json`。

## 当前已恢复研究：2026-10-24 下午

用户已要求继续；下方的关机暂停段落是历史记录。先读 `rust-research/resume-own-state-2026-10-24.md`、`rust-research/fakeplayers-static-2026-10-24.md`，再看 `RESUME-2026-10-24.md` 顶部更新。

本机管理服务已恢复。13:55–13:57 的三个研究连接均观察到自身完整快照与 FinishLoading，但生命状态为 Dead；随后全部出现传输断开，票据活动已清理为 false，目前不能当作仍在服。死亡会调用 EndSleeping，因此 Sleeping=false 不能直接解释为正常唤醒；昨天旧诊断没有生命字段，不能事后判断昨天也已死亡。新诊断只输出自身状态枚举、布尔和计数，不输出身份、生命值数值或坐标。

13:51:50–14:07:37 的31份只读采样已完成，没有账号恢复或服务器配置回滚义务。入服时 RCON/cp 从8增到11，可信新批次仍7；研究连接归零后其他玩家由8增到9，可信批次后来变8，不能将它算作研究账号收录。两个源都可能有采样失败，见独立证据中的可用性说明。

用户提供 `FakePlayers.dll` 后只做静态读取，没有执行、安装、修补原件或请求其外部服务。已确认是混淆的托管 Harmony 插件；已找到一条旧式非泛型 IList 读取与当前 ListHashSet 集合不兼容的路径。可见调用图中它只影响管理员聊天的一个容量分支，不能解释后台周期主路径的全部失效，也不是可信人数修复证明。22个方法的实质逻辑仍在资源解释器中。原件、IL、解码数组及外部许可信息保留本机 ignored 目录。

本地测试服已用用户现有启动脚本恢复，运行2635.289.1，未修改安全或统计配置。当前没有 RustClient 进程；用户原有 Steam 仍在运行。本轮新功能与后续观察须另看下面最新记录，不能将旧快照推广为当前状态。

普通自身重生诊断 `respawnOnDead` 已实现，默认关闭、严格布尔、每连接最多一次；要求同一自身实体 FinishLoading 与10秒内完整dead快照。14:13本地有限验证遇受保护加密后正常停止，未发respawn，票据已清理。14:13:32起单账号远端有限观察收到发送后的自身alive/healthPositive=true/sleeping=true快照；14:19:54只读playerlist另精确匹配到本账号当前Health>0、已连接380秒。这个独立观察不证明已醒或可信人数资格。累计663.734秒后于14:24:37正常断开，129份会话样本，`stopRequired=false`、state=closed、票据active=false。没有未完成的玩家连接清理义务。

公开可信人数14:21:33新批次由8变9，是候选信号而非修复结论。14:14:53–14:22:11的15份RCON中，其他9人的身份集合精确相同；14:22:43开始其中1人离开，14:25左右又回到同一集合。此变化会干扰离服对照。离服后原22份只读窗口14:35:36结束，补充11份14:40:52结束；补充是为了覆盖与入服约8分钟延迟相近的离服延迟。14:26:33新批次仍9，14:31:34降8、14:36:34仍8；回落时研究0、其他9且集合回到基线。它形成8→9→8时间关联，尚不能排除其他账号短暂重连或资格变化。本轮未启动RustClient，没有人工刷新游戏列表读数。详见 `respawn-observation-2026-10-24.md`；全部窗口已完成，没有玩家连接或配置恢复义务。

第2账号独立重复已完整结束：14:42:48开始，14:53:51正常离服，在服128份、660.297秒；随后33份只读观察于15:11:03结束，三个驱动complete、stopRequired=false、state=closed、票据inactive。可信序列8→7，未重现首轮8→9→8；56份独立集合比较发现3次其他玩家集合变化，存在混杂，不能确认研究账号资格。来源使用ignored `work/respawn-repeat-*`、最终SHA已固定，首轮文件保持不变。详见 `respawn-repeat-observation-2026-10-24.md/.json`。三个研究连接均关闭，无玩家连接/配置恢复义务；未发Tick、未改权限或配置。

普通唤醒Tick仍未实现或发送。新边界见 `wake-input-boundaries-2026-10-24.md`：ProtoDelta缺字段保留旧基线，空Input/ModelState/Vector3不能可靠覆盖；真实位置、眼位与Tick传输参数尚未闭环。player.wakeup注册及内部均有权限门槛，普通玩家不能借固定ConsoleCommand调用它；没有改变权限或使用全体唤醒。

## 已暂停：用户关机休息，明天继续

**首先阅读 `rust-research/RESUME-2026-10-24.md`。** 它汇总已验证、未验证、待验证事项、环境恢复步骤、优先级及验收目标。以下历史段落的在线状态和“正在运行”表述均不是当前状态。

用户明确要求保存推送后暂停，未安排夜间实验。第一轮因用户提前手动恢复而中断；第二轮20:31:21.276 UTC断开、20:41:25.305自动恢复、20:46:07.039正常停止，`restoreRequired=false`，没有未恢复的账号。第二轮31份样本均无其他玩家，RCON3→2→3，公共可信批次20:25/20:30/20:35/20:40/20:45均为0；恢复后观察因关机缩短至281.734秒。脱敏证据为 `repeat-count-control-2026-10-24.json`，不是已修复结论。

20:47:20 UTC再次只读确认gameplay_analytics=False，无开关回滚义务；旁路采样已20:37:46结束。20:46:05最后快照三账号都已入世界并验证票据，但睡眠标志不是始终true：账号2近期为false，账号3较旧样本为false，程序未发送Tick，原因待查。20:47:31已请求正常关闭管理服务，明天先启动服务和核对新状态再恢复连接。用户只有远端RCON，不能上传插件；已备妥的CountDiagnostics当前0.1.2离线编译通过、未运行。所有私有配置、身份、票据和原始记录仍在ignored目录。

20:50:19 UTC进一步确认管理端口无监听、研究Rust worker进程0、20093中转端点0；关机收尾摘要见 `rust-research/shutdown-state-2026-10-24.json`。

## 以下为历史研究过程，当前状态以上述接续文件为准

## 当前接续：临时统计开关已恢复，本地正常客户端对照待做

用户已提供目标RCON访问并明确同意：仅临时开启 `analytics.gameplay_analytics` 约12分钟，结束恢复False、不重启服务器。管理端点和密码仅保存在忽略的本机配置，不能写入提交或公开报告。

实际RCON19:44:23 UTC确认Players8；Gameplay=False、Tick=False、Performance=True、DryRun=False、EAC gameplay=True，gameplay_events使用Enabled的FPApi(server)。用户核对8人中3个是研究连接、5个是真实玩家，而列表仅3。不能仅归因于headless睡眠。

`work/rcon-gameplay-window.mjs` 已于19:49:32.939 UTC确认开启True，20:01:36.244 UTC恢复False，rollbackRequired=false；20:01:50 UTC另一次只读查询再次确认False。12分钟内Players始终8，Uploaded Bytes从98981增加到859058，但已观察公共新批次仍为3。DryRun=False且静态上传代码先检查HTTP成功才计字节；这仍不证明后台人数收录。被动WebRCON观察19:53–20:03未收到匹配上传诊断消息，不等于所有上传无错误。脱敏证据见 `gameplay-analytics-control-2026-10-24.json`。原始响应留work，不输出身份/管理端点/密码。

用户现已启动本地测试服 `127.0.0.1:20090`，查询20091；本地管理凭据仅存ignored配置。它在D:\RustServer\rustds运行，不应再称为完全未启动的副本。首次观察磁盘混用Rust.Global printable2634与Assembly-CSharp内联准入2635；此为更新前快照，后续变化见下一段及 `local-server-version-evidence-2026-10-24.json`。

后续更新：用户20:03–20:05 UTC更新并重启本地服，关键磁盘DLL恢复原版；新进程运行Protocol2635.289.1。正常客户端直连20:07:34观察Joining1→20:07:36 Players1，用户确认入世界，A2S/cp均1。随后只记录元数据的双socket本地UDP中转20093→20090已实际兼容本次正常客户端：20:10:35收到握手，20:11:04 Players1，用户确认进入世界，20:12:26离开并回直连。原版更新后的进程没有确认加载旧诊断插件，不得将旧进程0人基线当当前插件运行证据。CountDiagnostics0.1.1源码已准备、未实际编译执行。中转只记时间/方向/长度/首字节，不解码或保存认证载荷。

补充：0.1.1后已用现有SDK10.0.201/Roslyn5.3及16个本地Mono/服务端引用离线编译通过，未加载运行；源码SHA在 `count-diagnostics-build-2026-10-24.json`。中转20:14:48正常到期，共7722数据报；20093监听已关闭，20:15:40正常客户端直连Players1。修正后的中转生命周期仅语法复核，未重跑网络观察。远端只读确认Oxide2.0.7839；用户仅有RCON，不能上传源码，勿尝试控制台注入/任意代码执行来部署。

此前仅安装新的只读 `CountDiagnostics` Oxide源码，命令 `countdiag.snapshot`；0.1.0在旧进程编译/加载并取到0人/0连接基线，没有增加玩家或更改人数。现有pktmon在明确成功的3次loopback A2S查询中捕获0包，已停止且清空本次filter；不能拿空抓包推断客户端没发送。见 `local-test-server-observation-2026-10-24.json`。不要安装未知人数DLL或伪造上报。

## 最新：正常客户端对照完成，自身仍Sleeping

19:13:29–19:36:15 UTC两段48份只读采样已完成。用户退出到主菜单后，约19:24:30 UTC确认重新进入世界。三个独立账号全程保持不变，最后约30分钟留服且票据验证。Facepunch 19:15/19:20批次为5，19:25及19:30为4，19:35为3；用户也确认刷新收藏显示4。A2S/cp末段10/8、GMS8。不要将总人数变化唯一归因于用户，也未证明任一独立账号计入可信人数。见 `normal-client-count-control-2026-10-24.json`。

对照结束后已19:36:50正常关闭服务，19:37:02启动含ownPlayerState的新版本，并错开恢复三账号。19:37:55诊断三者Sleeping=true、ReceivingSnapshot=false，各4份自身快照，年龄14–24秒。当前管理服务exec session9053；下一步先GET会话状态，勿无故断开。没有发送PlayerTick。两帧纯输入候选有录制时ModelState为空及已醒竞态；尚未实现或执行。用户随后已提供RCON，见顶部的新观察。只读命令准备见 `rcon-player-count-observation.md`；不安装未知人数DLL或改统计。

## 最新接续：列表人数研究仍未完成

最新问题、运行实验和限制先读 `rust-research/player-count-update-2026-10-24.md`。用户确认目标 `61.147.247.35:28015`（查询 `28016`）的社区、收藏、历史列表均显示 5。三个独立会话已观察到自身实体、FinishLoading 和 Steam 接收方票据验证完成；A2S/cp 在三会话重连后从 `10/8` 增到 `13/11`，Steam CM GMS 精确目标认证人数为 11，而 Facepunch 公共人数服务多个新批次仍为 5。没有有效 EAC 会话。

尚未解决列表人数问题，不得将新增 Steam 活动上报或诊断接口称为已证修复。`D:\RustServer` 仅为用户提供的分析副本，不是远端当前运行目录。未启动、修改该副本或安装 DLL。优先继续对照另一条 `GameServers.GetServerList` 的统计及实际客户端可信人数消费路径。账号和网络原始记录留在忽略目录，勿输出凭据。当前阶段不应无故断开研究会话。

后续已恢复实际客户端消费闭环：公共接口回调→人数映射→按游戏IP+ConnectionPort查表→共享模型有限人数上限；客户端有一分钟请求阈值，与所观察的约五分钟远端批次分开解释。`GameServers.GetServerList` 目前未返回目标计数，不能当作空服证据。19:00代理修复让Steam CM复用现有系统HTTP代理，解决直连冷启动目录超时；19:03短暂Steam重连后，19:06:52已正常恢复三会话。继续工作先查实时状态，别把这些历史快照当作当前在线保证。

## 最新接续：独立 Steam 票据与原生传输已实测

**更新：当前目标已完成独立真实玩家入服。** `rust-session` 持续模式已匹配本账号实体和精确FinishLoading，确认PlayerInit→EnterGame；保持146.922秒后API优雅断开成功，再从网页重连成功。A2S人数9/cp7→10/cp8→断开后9/cp7。当前没有有效EAC受保护会话；服务器允许该连接的配置不能推广到其他secure目标。新网页路径：账号详情→Rust服务器连接。继续工作前先GET rust-session查询，避免打断已在线会话。

本机data/rust-runtime.json已保存Python和RakNet.dll路径；未提交。正常start.cmd可读取，不再需要每次手设环境变量。GET/POST/DELETE /v1/accounts/{id}/rust-session分别查询/连接/停止；关闭网页继续连接，服务重启后需重新点击连接。研究证据及限制见最新独立连接报告和player-admission-evidence-2026-10-24.json。此前“尚未独立入服”表述是历史状态。

网页重连后快照已运行271.672秒，接收59449条消息，仍为entered_game。原Steam/Rust进程保留作观察基线；没有进行两者全部退出后的重连实验。程序自行登录Steam和取得新票据，不使用原客户端会话或IPC；仍需兼容RakNet.dll。未实现或发送PlayerTick，不保证无限期留服。

先读 `rust-research/independent-connection-2026-10-24.md` 及同名 JSON。独立 Python + 安装目录 RakNet.dll 已与 `61.147.247.35:28015` 建立传输连接，收到 accepted 与 RequestUserInformation，未启动新的 Steam/Rust 客户端。独立 Steam 服务已取得并核验所有权及240字节会话票据，取得143字节加密应用票据，诊断票据取消确认。它们尚不能证明Rust玩家入服或有效EAC。

重连抓包内43,425个数据报、39,378个ACK、11个NAK已精确解析；数据报偏移8帧起点和ACK时间字段对应上游UDT时间字段分支。身份所有七个长度前缀u32LE；两次Ready均为982字节protobuf+头。此前“内部可靠消息/分片未解码”的记录已由新证据更新。

`steam-multi-account/src/game-auth.js` 提供脱敏诊断和互斥的内部票据lease，断线会abort并等待取消/清零。新增 `rust-connect` 限时研究API和Python worker，遇EAC/保护要求结束尝试。服务启动前配置 `RUST_NATIVE_DLL` 和 `RUST_PYTHON` 的本机绝对路径。原始票据不得复制到命令行、报告或Git；不能复用抓包中的EOS身份或他人票据。

首次独立身份尝试已实际运行60.078秒：Approved(encryption=0)→最小Ready→10078应用消息（1320 Entities/6257 EntityPosition/935 RPC），没有EAC或拒绝，由本地期限关闭。下一步明确匹配自身实体和FinishLoading，以及更长留服验证；不能把此阶段直接标为有效EAC。

## 最新接续：真实客户端已观测

2026-10-24 在用户的新电脑上启动了 Steam 管理服务（`http://127.0.0.1:3210/`，`/health` 成功）。用户提供 Rust 安装目录 `E:\SteamLibrary\steamapps\common\Rust`，客户端已运行。先阅读新增的 `rust-research/client-observation-2026-10-24.md` 和同名 JSON，再参考下面的历史研究。

当前客户端日志：protocol `2635.289.1`、changeset `168909`；Steam build ID `26140533`。客户端是 IL2CPP，metadata 版本字段 39。当前实际游戏目标为 `61.147.247.35:28015`，查询为 `28016`，与此前两台目标分开记录。

已完成 90 秒会话基线和 300 秒正常重连观察，主捕获共 107,740 包。两次完整 RakNet 离线握手的版本字节均为 6。MTU 位置按 BE 为 30725、LE 为 1400；不能直接套用上游默认字节序。RakNet security 标志为 0 不代表 EAC 状态。内部可靠消息、分片、应用载荷和加密边界仍未解码。

对当前服务器的四次独立 A2S 样本均为 players 比 cp 多 2（14/12 → 12/10），未取得服务端活跃名单或浏览器刷新显示，差异原因未定位。现有目标不能用于证明旧目标的 EAC 策略。仍未实现 Rust 独立玩家客户端或验证独立 EAC 会话。

新增复核工具：`tools/rust-research/capture-client.ps1`、`analyze-capture.mjs`。主采集原始资料在被忽略的 `captures/20261024-011608/`、`captures/20261024-reconnect/`，静态资料在 `work/`，不得推送。另外两段 10 秒采集分别复核正常清理与启动日志写入失败场景，结果均已停止并清空本次过滤器；对应 `captures/20261024-tool-validation/`、`captures/20261024-final-validation/`。下文所述“未安装客户端/未抓包”是 2026-10-23 历史状态，已由此次观察更新。

## 用户目标与当前进度

用户希望在一个 Windows 用户会话内，通过 Node.js 接口同时保持多个 Steam 账号在线，查看账号和库存、领取免费游戏，并进一步研究不启动完整 Rust 客户端的玩家入服与持续连接。

目前提供的 Steam 服务使用 `steam-user@5.3.0`，支持独立连接、Steam Guard、令牌加密存储、自动重连、账号详情、游戏库、库存、免费 AppID/SubID 许可申请，以及保存和恢复 `gamesPlayed()` 配置。账号在其他位置游戏时会暂停本服务的游戏活动设置。

Rust 部分已完成有证据依据的服务端静态研究和公开服务器查询。**没有建立过经过认证的 Rust 玩家连接，也没有生成或验证有效的 Rust EAC 客户端会话。** 不能把 A2S 查询成功、Steam 显示“正在玩 Rust”或应用层字段分析当成玩家入服成功。

已有服务测试曾在原电脑通过 15 项；此记录不代表在新电脑、当前提交或真实 Rust 客户端上重新验证。

## 当前接续点

原电脑没有安装 Rust，也无法启动游戏。用户计划晚上在另一台 Windows 电脑上继续，让 Codex 分析 Rust 安装目录，并由用户正常启动客户端、连接服务器，配合观察日志和网络活动。

**尚未获得客户端安装目录；尚未检查抓包工具和实际权限；尚未开始抓包。** 此仓库没有可直接运行的 Rust 无客户端入服程序。

建议先阅读：

1. `rust-research/研究报告.md`
2. `rust-research/evidence.json`
3. `rust-research/protocol-map.json`
4. `steam-multi-account/README.md`

2026-10-23 后续又完成了一轮公开资料与原生库研究，接着阅读 `rust-research/research-update-2026-10-23.md`、`rust-research/native-transport-evidence.json` 和 `rust-research/client-observation-plan.md`。新增 65 条来源记录保存在 `web-sources-2026-10-23.json`，原始第一轮证据保持独立。

新增的主要线索：相同 Steam manifest 的 x64 `RakNet.dll` 静态导出 36 个函数，包含 NET_StartClient，托管封装的 29 个原生导入全部匹配。没有加载或执行它。后续可优先评估复用原生传输；另有 `extremeheat/node-raknet-native` 的通用 Node.js 绑定候选，仍需实际兼容性证据。RakNet 传输版本、Rust 应用协议 2635 和身份标记 228 是不同字段。

观察准备已补充 Wireshark RakNet 解析器、完整包采集、阶段时间线和日志关联方案。pktmon 默认每包仅保存 128 字节，默认循环日志还可能覆盖开头。客户端未安装、未取得目录、未开始抓包的状态仍然成立。

用户已明确要求：每批文件更新后提交并推送到 Gitee，并核对远端提交；此偏好已写入 AGENTS.md。

新增人数问题：用户确认 Welcome.cs 使用 `OnPlayerConnected`，账号能持续留服，但 Rust 游戏内服务器列表人数不增加。详见 `rust-research/player-count-diagnosis.md`、`player-count-evidence.json` 和 `player-count-sources.json`。标准 Oxide 钩子位于 PlayerInit 的活跃列表添加之后；原版服务端每 30 秒将 `activePlayerList.Count` 写入 `cp` 标签。不能再简单归因于只到初始认证或短暂连接，也不能未经核对就把 cp 当成 A2S_INFO players 或 Rust 浏览器最终显示值。Steam 玩家资料另经 UpdatePlayerSession → BUpdateUserData 更新；本轮没有观察到实际调用失败或确认其对 A2S 人数字段的影响。下一步需要同一时刻的内部活跃列表、cp、A2S_INFO players 和手动刷新后的浏览器人数。目标服务端状态、完整 Welcome.cs 和控制程序均未取得；原因尚未定位。本轮没有新建玩家连接。

用户随后新增研究对象 `103.91.208.182:16666`（查询 16668），称一台电脑控制大量真实账号，不启动游戏客户端，每账号不同 IP/端口，持续留服且 Rust 玩家列表更新；地址来自服务器管理员插件或日志。详见 `rust-research/server-103-91-208-182.md` 与对应 observation.json。2026-10-23 15:38（北京时间）Steam GetServersAtAddress 证实登记的游戏/查询端口相符，但本机 A2S 初次及重试均超时；同时旧目标查询成功，1/150、cp1。未取得新目标人数或 EAC 配置。多 socket、多可路由地址/UDP 出口结构能解释网络现象，不能据此确认具体客户端和认证机制。地址字段的静态调用链已记录，但尚未取得管理员插件具体字段；没有建立玩家连接。两个目标的查询与用户观察需要分别保存。

## 在新电脑上的下一步

1. 获取用户提供的 Rust 安装目录，确认当前客户端版本、目录结构和普通客户端日志位置。静态读取程序集作为数据分析，区分托管程序集、原生网络组件和 EAC 组件。
2. 盘点本机已有工具，例如 pktmon、netsh trace、Wireshark/dumpcap/tshark 和 Npcap，以及实际 Windows 权限。先确认工具是否存在，不能预先承诺能观察全部进程内部操作。
3. 准备一次有阶段时间标记的正常客户端观察：启动 → 登录 → 连接目标 → 加载 → 进入世界 → 静止停留 → 断开。抓包开始前与用户协调启动时机。
4. 对照客户端日志与包的端点、方向、大小和时间，区分 Steam/EOS 通信、Rust 游戏端口和 A2S 查询。加密流量只能直接看到密文，抓包不自动产生明文、可复用会话或有效 EAC 认证。
5. 将新发现与现有服务端证据核对，记录可直接观察到的事实和仍缺少的部分。EAC 可能限制调试器、进程内存访问等观察手段。

原始抓包、客户端日志与机器资料放在被忽略的 `captures/` 或本地 `work/` 中。不得把登录令牌、Cookie、实际认证票据或其他账号秘密写入提交和公开报告。

## 目标服务器

- 游戏地址：`202.189.21.138:28015`
- 查询地址：`202.189.21.138:28017`
- 用户说明：最新版本，开启 EAC；没有提供服务器管理权限。
- 2026-10-23 14:10:54 的公开查询：protocol `2635`、build/changeset `168909`、标签 `ptrak`、3/150 人。
- `ptrak` 支持 RakNet 传输判断。VAC secure 标记为 true，不能据此证明 EAC 的具体执行配置。
- 完整查询记录见 `rust-research/target-query.json`。先重新查询，不能假定服务器一直保持同一版本。

## 已核对的关键技术事实

- 当前研究版本的连接标记为 `228 / 0xE4`，protocol 为 `2635`。
- Rust 应用层消息头是消息枚举加 `140`；它位于传输/加密封装内部，不能直接当作完整 UDP 报文。
- 服务端请求身份 → 客户端提交身份 → Steam/EAC 等准入 → 队列 → Approval → ClientReady → 玩家初始化。
- 身份读取顺序包含 SteamID、协议、OS、用户名、分支、Steam token、anticheatId、anticheatToken、changeset、构建时间和语言。具体类型和长度检查见 `protocol-map.json`。
- 玩家更新使用 `ProtoDelta<PlayerTick>` 和上一条状态作为基线，不能假定定时发送常量字节即可持续连接。
- 当前原始服务端使用 Epic Online Services。Steam 游戏会话票据、EOS 身份和 EAC 受保护会话各有自己的作用。
- EOS 共同登录封装使用 `ExternalCredentialType.SteamAppTicket=1`，官方文档指 Steam Encrypted App Ticket；这不等同于 Steam auth session ticket，也不证明真实 Rust 客户端已完成 EOS 登录。
- EAC 代码有 RegisterClient、ReceiveMessageFromClient、ProtectMessage/UnprotectMessage 和异步认证状态处理；前期准入是否等待完整后端认证取决于配置。
- 自己创建 EOS 产品、取得 Steam 票据或观察到反作弊消息，都不能据此断言获得 Rust 产品的有效 EAC 会话。
- 原生 RakNet 兼容、完整序列化与增量封装、真实客户端发送节奏、Rust 产品下的受保护会话仍需实际证据。

## 复核研究来源

使用 SteamRE DepotDownloader 3.4.0，对 Steam 专用服务器 App `258550` 进行匿名下载，仅取得 7 个原始程序集：

| Depot | Manifest |
| --- | --- |
| 258551 | 93946663446561466 |
| 258554 | 2507054976021021832 |

静态工具为 dnlib 4.5.0。`evidence.json` 保存 7 个模块的 SHA-256、MVID 和 24 条方法记录；`protocol-map.json` 保存 28 个应用消息和 4 组部分 schema。原始游戏程序集、反编译中间文件和下载的第三方二进制未随仓库提交，可按 `tools/rust-research/README.md` 在本机获取和复核。

此前使用过 Oxide 2.0.7839 交叉核对，最终证据采用 Steam 原始文件。不要混淆 Steam build ID、游戏 changeset、网络 protocol。

## Steam 服务与迁移

- 需要 Node.js 22 或更新版本。`steam-multi-account/start.cmd` 在缺少依赖时执行 `npm ci`。
- 默认 HTTP 地址：`http://127.0.0.1:3210/`。管理页面可直接打开，`/v1/` API 需要 `Authorization: Bearer <本机 data/api-key.txt 内容>`。
- 使用 `open-dashboard.cmd` 可以自动带上本机密钥打开管理页面。不要把带密钥的 URL 粘贴到日志或聊天中。
- `data/accounts.enc` 使用 AES-GCM 保存账号资料；Windows 密钥由 DPAPI CurrentUser 保护，绑定电脑和用户。新电脑需要重新登录并完成 Steam Guard。
- 本仓库不包含账号数据、API 密钥、Cookie、刷新令牌、日志或 `node_modules`。原电脑运行中的服务也没有因本次上传而迁移或停止。
- 服务器代码和静态资源在启动时加载，修改后需要正常重启服务。不要启动两个服务同时访问同一个数据目录。
- 可复用 `steam-multi-account/src/network.js` 的 `createSteamNetwork()`。它支持环境变量和 Windows 静态代理检测；原电脑上普通 Node fetch 曾超时，代理配置属于各电脑本地设置。

## 给下一次 Codex 的提示词

> 请先阅读 HANDOFF.md 和 rust-research/研究报告.md，接着核实本机环境。我现在有安装 Rust 的电脑，会提供游戏目录并手动启动游戏。请先分析版本、文件和日志，再准备正常客户端连接过程的网络观察，结合时间线与现有证据更新研究。请准确区分观察事实、推断和未完成部分，保护所有账号凭据。
