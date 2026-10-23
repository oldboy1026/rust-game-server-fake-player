# 独立 Steam 票据与 Rust 传输实测

2026-10-24，目标 `61.147.247.35:28015`。这是当前真实客户端所连接的服务器，与历史的两台研究目标分别记录。脱敏证据见同名 JSON。

## 已实际完成的部分

独立 Python 程序直接调用安装目录中经过哈希核对的 x64 `RakNet.dll`。没有启动新的 Steam 桌面客户端或 Rust 游戏进程。一次 8 秒连接收到 `0x10`（RakNet 接受连接）和 `0x9d`（Rust 请求身份），随后正常关闭。这证明原生传输、ABI 和目标服务器兼容；这一尝试没有发送玩家身份。

独立 Node.js Steam 会话实际取得了 Rust AppID 252490 的所有权票据、游戏会话票据和加密应用票据，长度分别为 184、240、143 字节。所有权及会话票据通过签名、有效期、账号和 AppID 核对。诊断结束后确认取消一张本实例会话票据，并清零取得的票据 Buffer。没有把票据、账号 ID、密码或反作弊身份写入报告和 API。

票据签发与本地签名核验，不能代替目标 Rust 服务器的认证结果。有效 EOS 身份和 EAC 受保护会话仍需分别验证。

第一次独立身份连接已经实际运行 60.078 秒：真实 Steam 会话票据被服务器接受，收到 Approved（encryption=0），随后发出最小 Ready。持续收到 10,078 个应用消息，包括 1,320 个 Entities、6,257 个 EntityPosition 和 935 个 RPC。没有收到断开原因、EAC 消息或传输断线，由本地时限主动正常关闭。

后续持续模式已完成更直接的玩家入服验证：从 `Entities` 的 `Entity.basePlayer.userid` 仅比较本账号真实 SteamID，取得自身实体 ID 后，收到只发给该实体的 13 字节 `FinishLoading` RPC。函数 ID 为 `2811987493`，由原版 `ManifestHash` 算法及两次真实客户端重连共同核对。因此确认服务器执行了本账号 `PlayerInit` 和 `EnterGame`；实际持续 146.922 秒后，通过 API 优雅停止，原生关闭及 Steam 票据清理完成。随后从网页重新连接，再次识别自身实体和 FinishLoading，保持持续运行。

网页重连后的后续快照已连续运行 271.672 秒，接收 59,449 条消息，仍为 `entered_game`。实测期间原有 Steam/Rust 客户端保留作观察基线，没有进行将两者全部退出后的重复连接。独立程序自行连接 Steam 并使用本实例的新票据，不读取原客户端会话或通过其 IPC 建立游戏连接；它直接加载安装目录的兼容 RakNet 原生库。

公开查询交叉观察：连接前 `A2S_INFO players=9 / cp7`，连接后 `10 / cp8`，断开后回到 `9 / cp7`，符合新增一名活跃玩家。A2S_PLAYER 名称未匹配到本地 Steam 昵称，不能单凭名称查询确认个人身份；个人身份依据前述自身实体匹配。此结果也不解决原有 players 比 cp 多 2 的差异原因。

当前版本服务端静态实现允许未启用 secure 的服务器直接推进内部 EAC 状态；这与有效受保护 EAC 会话不同。因此当前目标的连接结果不能推广到历史所述启用 EAC 的服务器。

## 实际帧格式已对齐

重连捕获的 82,822 个游戏端点包包含 43,425 个连接数据报、39,378 个 ACK、11 个 NAK 和 8 个离线握手包。数据报内共 52,322 帧，其中 1,760 个分片形成 589 个完整分片组；全部数据报及 ACK/NAK 边界精确解析。

数据帧起点是 UDP 载荷偏移 8：标志 1 字节、发送时间低 32 位 4 字节、数据报序号 3 字节。39,378 个 ACK 的时间字段均与其引用的反向数据报一致。此布局与固定上游 RakNet 的 `INCLUDE_TIMESTAMP_WITH_DATAGRAMS=1` 分支相符；上游在使用 UDT 拥塞控制时启用此分支。无需仅凭差异推断成 Rust 私有字段。帧 bit 长度、分片整数和 ACK 记录数均按小端解析。

两个实际身份报文均为 1,306 字节，七个字符串或字节数组使用 `u32LE` 长度前缀。Steam 会话票据 240 字节、反作弊身份 32 字节、反作弊 token 940 字节；只读取长度并跳过内容。协议 2635、标记 228、changeset 168909 和构建时间均与当前版本吻合。

两个 Ready 报文都是 `0x90` 加 982 字节 Protobuf，包含 28 个 name/value 类型 ClientInfo 条目，没有顶层 globalNetworking 或 party。不能复制其硬件资料作为另一个客户端的身份。

## 当前程序接口

`POST /v1/accounts/{id}/rust-auth-check`，请求体 `{}`，返回票据签发、核验及取消的元数据。需要本机 Bearer API key。

`POST /v1/accounts/{id}/rust-session` 接受 IPv4 `host` 和游戏端口 `port`，启动持续连接。`GET` 查询阶段、接收数量和自身实体/加载完成的布尔结果，`DELETE` 断开。网页账号详情的 Rust 服务器连接面板提供相同操作。持续模式只接收世界数据并维持原生传输，没有实现移动或世界模拟，未实现或发送 PlayerTick，也没有有效 EAC 会话。

`tools/rust-research/native-peer.py` 可执行限时传输连接。`analyze-raknet-frames.mjs` 离线解析原始捕获，默认只统计边界和首字节；`--inspect-application-shapes` 才检查身份长度和 Protobuf 字段。原始捕获继续保存在忽略目录。

后续独立身份连接由匿名本机管道传递新申请的票据，并在网络进程结束后取消票据。不会把抓包中的旧票据或另一账号的 EOS/EAC token 用于新连接。

参考：[上游时间字段开关](https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.h#L40)、[报头序列化](https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L110)。
