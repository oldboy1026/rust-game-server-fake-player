# 正常 Rust 客户端连接观察方案

本方案供装有游戏的 Windows 电脑使用。本轮只准备文档，尚未在那台电脑执行。目标游戏端点为 `202.189.21.138:28015`，A2S 查询端点为 `202.189.21.138:28017`。

**执行更新（2026-10-24）：** 已在装有 Rust 的电脑完成会话基线和正常重连采集，实际目标与本方案原目标不同，见 [客户端观察报告](./client-observation-2026-10-24.md)。下文保留原始准备方案。可使用 `tools/rust-research/capture-client.ps1` 执行限时采集，再用 `analyze-capture.mjs` 输出脱敏汇总；参数与范围见工具 README。采集结束后必须实际核对 pktmon 状态与过滤器。

## 开始前确认

先记录 Windows 版本、Rust 安装目录与构建信息、客户端/网络组件 SHA-256、实际使用的启动方式和网卡。检查现有 pktmon、Wireshark/dumpcap/tshark、Npcap 和实际权限；Wireshark 工具可能在 `C:\Program Files\Wireshark` 而没有加入 PATH。

保留正常 Steam/EAC 启动流程和当前网络配置。第一次采集保持常规图形、日志设置；以完整正常连接建立基线。Unity 通用 `-batchmode`、`-nographics` 等参数是否适用 Rust 尚未验证，而且部分参数会影响日志行为。

在仓库根目录创建本地目录：

```powershell
$captureDirectory = Join-Path (Get-Location) ('captures\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $captureDirectory -Force | Out-Null
```

`captures/` 已被 Git 忽略，原始数据保留在本机。日志、抓包或完整命令行可能包含身份资料和认证数据；仓库只提交经过整理、去除秘密的信息。

## 方案 A：已有 Wireshark/Npcap 时使用 dumpcap

先用 `dumpcap -D` 查看接口，选中确实承载目标通信的网卡。下列变量需按本机实际位置和接口编号设置：

```powershell
$dumpcapPath = Join-Path $env:ProgramFiles 'Wireshark\dumpcap.exe'
& $dumpcapPath -D
$captureInterface = 1 # 替换成上一步确定的编号

& $dumpcapPath -i $captureInterface -p -s 0 `
  -f 'udp and host 202.189.21.138 and (port 28015 or port 28017)' `
  -a duration:900 -a filesize:250000 `
  -w (Join-Path $captureDirectory 'rust.pcapng')
```

在单独的终端运行采集，再启动客户端。采集会在 15 分钟或约 250 MB 时停止，以先达到的条件为准；也可按 Ctrl+C 提前结束。它保留采集开头；若达到大小限制，应记录停止时刻，并按需要另开一段。

该过滤器保存目标游戏和查询 UDP 通信。Steam/EOS 的其他地址、端口以及本地 IPC 不在这个采集范围内，之后需要根据实际进程和端点单独确定观察范围。

## 方案 B：使用系统 pktmon

先查看 `pktmon status`、`pktmon filter list` 和本机帮助，确认没有其他采集任务。现有过滤器会与新增过滤器以 OR 方式共同影响结果；不要直接清空其他任务的过滤器。如果已有任务，优先使用独立的 dumpcap 采集。

在能够操作 pktmon 的终端中，添加两个命名过滤器：

```powershell
pktmon filter add RustGameResearch -i 202.189.21.138 -t UDP -p 28015
pktmon filter add RustQueryResearch -i 202.189.21.138 -t UDP -p 28017
pktmon start --capture --comp nics --pkt-size 0 --log-mode multi-file `
  --file-size 128 --file-name (Join-Path $captureDirectory 'rust.etl')
```

**`--pkt-size 0` 保存完整包；默认值只有 128 字节。** `multi-file` 会在文件达到大小后创建后续文件，保留开头的握手；采集期间要留意磁盘空间，并在观察结束时主动停止。开始失败时先解决权限或参数问题，确认状态已开始后再启动游戏。

```powershell
pktmon stop
pktmon filter remove RustGameResearch
pktmon filter remove RustQueryResearch
```

保留原始 ETL，并对实际生成的每个 ETL 分别转换，例如：

```powershell
pktmon etl2pcap (Join-Path $captureDirectory 'rust.etl') `
  --out (Join-Path $captureDirectory 'rust.pcapng')
```

多文件模式可能产生带序号的文件，应以目录中实际文件名为准。ETL 转换为 pcapng 会丢失部分 Windows 组件和丢包信息；如有同一包在多个组件出现的情况，使用 `pktmon list`、原 ETL 与转换参数 `--component-id` 核对，不能直接把重复记录算作网络重传。

## 每个阶段记录时间

在游戏启动前开始采集，在另一终端记录关键时刻。统一使用带时区的时间字符串，例如：

```powershell
('client-start ' + (Get-Date -Format o)) | Add-Content -LiteralPath (Join-Path $captureDirectory 'timeline.txt') -Encoding UTF8
```

后续分别标注 `connect-click`、`queue`、`loading`、`entered-world`、`idle-start`、`idle-end`、`disconnect`。记录当前环境实际发生的阶段，不要因为包开始出现就标记已经进入游戏。

建议顺序：启动 → 菜单 → 发起连接 → 排队/加载 → 进入世界 → 静止停留至少 10 分钟 → 正常断开。若达到采集时间限制前仍未进入世界，应单独记录，并为稳定停留安排下一段。首轮先获取完整正常流程。

先确认 Rust 的实际日志位置。Unity 文档给出的 Windows Player 日志通用路径是 `%USERPROFILE%\AppData\LocalLow\CompanyName\ProductName\Player.log`；Rust 可能自行指定路径，不能直接把通用模板当作已确认的位置。用户提供目录后再检查生成文件和时间戳。

## 进程、端口和包的关联

记录实际 Rust 进程 ID。`Get-NetUDPEndpoint` 可按 `OwningProcess` 查本地 UDP 端口，但本身不提供完整的 UDP 远端会话表。需要结合抓包中的本地端口、目标端点和阶段时间推断归属，不能只凭端口号认定某包属于 EAC。

后台查询工具也可能访问 `28017`。若同时执行 A2S 查询，应单独标注时间；A2S 通信不代表玩家游戏连接。

Wireshark 已有 `raknet` 解析器。首先检查安装版本与可用字段，再观察是否自动识别完整握手。解析失败时保留原始数据，判断是采集缺失、版本差异、加密还是解析器范围限制。不要强行将任意 UDP 数据按 Rust 应用消息编号解码。

可用下列 tshark 命令先导出时间、端点和长度，不输出载荷：

```powershell
$tsharkPath = Join-Path $env:ProgramFiles 'Wireshark\tshark.exe'
& $tsharkPath -r (Join-Path $captureDirectory 'rust.pcapng') `
  -Y 'ip.addr == 202.189.21.138 && udp.port == 28015' `
  -T fields -E header=y -E separator=, `
  -e frame.time_epoch -e ip.src -e udp.srcport -e ip.dst -e udp.dstport -e udp.length |
  Set-Content -LiteralPath (Join-Path $captureDirectory 'game-metadata.csv') -Encoding UTF8
```

## 本次观察应回答的问题

| 问题 | 可采集证据 | 不能单独据此认定的结论 |
| --- | --- | --- |
| 实际传输握手和版本是什么 | 连接前起始的完整报文、原生库信息、解析器结果 | Rust 应用协议 2635 就是 RakNet 传输版本 |
| 应用消息是否能读取 | 正确重组后的载荷及明确的加密边界 | UDP 首字节可直接按应用层偏移 140 解析 |
| 静止时有哪些持续通信 | 分阶段频率、方向、长度，配合日志和可解析字段 | 周期相似的包就是固定 EAC 心跳 |
| 断线发生在哪一阶段 | 客户端提示、日志、包时间线 | 观察到几分钟通信就证明反作弊已完成 |
| 是否成功入服并稳定在线 | 真实玩家进入世界及持续状态，必要时配合可获得的服务端证据 | A2S 人数变化或 Steam 游戏状态即可单独证明成功 |

只有客户端侧观察时，应明确哪些认证状态尚无服务端证据。任何加密数据、静态原生接口或持续通信，都不能单独证明已实现独立的有效 EAC 会话。

## 已核对的工具资料

- [Microsoft：pktmon start](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-start)
- [Microsoft：pktmon filter add](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-filter-add)
- [Microsoft：pktmon etl2pcap](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-etl2pcap)
- [Wireshark：dumpcap](https://www.wireshark.org/docs/man-pages/dumpcap.html)
- [Wireshark：tshark](https://www.wireshark.org/docs/man-pages/tshark.html)
- [Wireshark：RakNet 字段表](https://www.wireshark.org/docs/dfref/r/raknet.html)
- [Unity：Log files](https://docs.unity3d.com/Manual/log-files.html)
- [Unity：Player command line arguments](https://docs.unity3d.com/Manual/PlayerCommandLineArguments.html)
