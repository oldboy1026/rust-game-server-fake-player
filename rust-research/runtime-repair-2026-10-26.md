# 2026-10-26：恢复本机运行库并实测等级 1 入服

目标 `61.147.247.25:40176`。本轮已实际进入游戏世界；测试账号保留在线。对应脱敏阶段、原始材料哈希与限制见同名 JSON，原始材料保存在本机 ignored `work/runtime-repair/`。这修正了上轮只让运行库错误可见、没有恢复实际连接的未完成状态。

## 两个独立原因

1. 换电脑/数据目录后没有 `data/rust-runtime.json`，服务环境也没有 DLL/Python 路径，连接在申请票据前停止。上轮补了错误展示，却没有补齐本机运行库。
2. 配置运行库后，目标返回 Approval 的 `encryptionLevel=1`。旧 worker 拒绝所有非零等级，导致在 Ready 前主动结束。等级 1 在当前版本是普通 XOR 协议混淆，不能一律解释为 EAC。旧服实测等级 0，因此之前的成功没有覆盖此兼容性缺口。

## 原生运行库适配

现有库来自 Steam 专用服务器 app 258550、depot 258551、manifest 93946663446561466；Windows x64 PE32+，312656 字节，SHA256 `a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21`。本轮 Authenticode 状态 Valid、签名者 Facepunch Studios Ltd。没有从随机网站取得库，也不把游戏原生文件提交到仓库。

对 objdump 输出与既有客户端 ABI 逐项核对：NET_Create 0x18d0 分配并初始化两个流；NET_Close 0x17e0 释放接收包、关闭 peer；NET_StartClient 0x1e60 转发 remotePort/attemptCount/interval/timeout；NET_Receive 0x1d10 的 bool 返回在 AL，接收指针只借用到下次 receive/close。另核对 NETRCV_GUID/LengthBits/RawData、NETSND_Start/WriteBytes/Send 的返回与参数宽度。相同导出名称本身没有被当成兼容证明。

先在独立 Python 子进程执行无 socket 的创建/关闭，成功；再显式连接目标作 5 秒 transport-only 探测，StartClient=0，收到 0x10 与 0x9d，正常关闭，没有提交账号身份。最后才把这个精确哈希加入 Node 与 Python 支持名单。原客户端哈希继续支持；未知哈希仍拒绝，文件实际完整 SHA256 和架构仍在原生加载前检查。

配置脚本保存 `{dll,python,sha256}`；环境 DLL 覆盖不继承另一份保存配置的哈希。API 元数据记录 worker 实际选择的已支持哈希，缺失/未知值不冒充客户端哈希。本机已配置现有库和 Python 3.12.14 x64；配置文件及私有绝对路径不提交。

## 等级 1 的静态依据与实现

只用 dnlib 读取原始程序集和 RVA 常量，没有运行游戏托管程序集：

| 程序集 | SHA256 | 关键方法 |
| --- | --- | --- |
| Assembly-CSharp.dll | `71c50c6f0a48f67702cc2328e255e0000803919599c6fea6705cc22c3aa94601` | NetworkCryptographyServer.EncryptionHandler/DecryptionHandler（100691626/100691627）、Craptography.XOR（100696542） |
| Facepunch.Network.dll | `864ecda900aaa64f3908c4dc0fc012d6857a5f9a8df3467130bbaa304fc9e833` | BaseNetwork.Encrypt/Decrypt（100663350/100663349）、Message..cctor（100663451） |

NetworkCryptographyServer 在等级 >1 调用 EACServer.Encrypt/Decrypt；等级 <=1 的 handler 使用 protocol 2635 调用 Craptography.XOR。BaseNetwork 外层对等级 0 直接返回，因此实际只对等级 1 应用普通混淆。包头不变，仅 enum 索引 1..27 且 EncryptionPerType=true 的载荷处理；每包从表的 `2635 % 256 = 75` 开始，循环 256 字节表。

新 `rust_packet_codec.py` 按此路径收发，数组内容哈希与原始 RVA 字段名分别一致：256 字节表 `3682c3d0020436c45462995a4f64438c144bbfeba725b00de5906ab322b6b915`；30 字节类型表 `89ba46b3662e51e173cf7317420e88c32553305fd1af395c8b0e6d91dab1f060`。不修改原生借用缓冲。聊天、普通重生、有限唤醒和维护也统一经过当前连接的编解码器，原有状态/自身实体门控保留。

等级 2 及以上仍停止，0xA2 EAC 消息仍停止，未更改 EAC 或服务器配置，也没有实现有效 EAC 会话。

## 实际测试

- 北京时间 12:11:20，使用网页相同的批量操作 API，仅提交一个在线空闲账号。运行库已成功创建、连接、提交身份，收到 Approval 等级 1；旧保护分支主动停止，Ready=false，票据清理至 inactive。
- 补上编解码器后，12:15:53 对同一目标再发起单账号操作；12:15:57 已有自身实体，12:15:59 首次观察到 `entered_game`、自身 FinishLoading、Steam 票据 `serverValidationObserved=true`。
- 12:17:58 只读复查：同一 startedAt 未改变、endedAt=null、closed=false、票据仍 active 且已观察验证，网络持续收包。最近自身完整快照为 alive/sleeping，快照年龄单独保留，不能把较老的角色快照描述成实时角色状态。没有发聊天、重生或唤醒 Tick。
- 另一个非本轮工具发起的 48 账号连接批次出现在 12:17:23；12:18:27 服务已显示目标 5 个 entered_game。保留该批次和所有现有连接，不把它们算成本轮单账号自动测试，也不重启服务中断它们。
- Steam 登记解析查询端口为 40177；12:17:58 A2S players=5、cp=3、VAC secure=false、protocol=2635。Facepunch 公共接口没有此目标条目，不能当作人数 0，也不能宣称公共可信人数修复。这些计数不同步，不是单账号采用回执；VAC 标记也不是有效 EAC 会话证明。

Node 全套测试 54/54，Python 相关测试 45/45。新增覆盖实际运行库哈希传递/未知版本预检、固定向量/逐包重置/类型选择/长包循环、等级 1 自身实体与 FinishLoading、唤醒和维护编解码、其他实体不能冒充入服，以及 EAC/等级 >1 仍停止。聊天、重生复用发送路径，但未作等级 1 的实服操作验证。

服务运行在 `http://127.0.0.1:3210/rust`，无需为 Python worker 更新再次重启主服务。持续连接本身不会在服务重启后自动恢复；当前连接应保留。
