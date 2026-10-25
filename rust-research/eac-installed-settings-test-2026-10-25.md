# 官方安装配置的独立 EAC 初始化测试

2026-10-25，北京时间。用户要求补齐 EOS 身份、EAC 受保护会话和消息保护，随后要求先使用官方游戏安装配置测试。**已实际执行官方 SDK 初始化，但 EOS 平台创建失败，尚未建立有效 EAC 会话，三项接入需求仍未完成。**

## 实际测试结果

20:15:55，使用已安装官方 EOSSDK 1.19.1.2-55908005 与原始 EasyAntiCheat/Settings.json，独立进程返回：

| 阶段 | 实际结果 |
| --- | --- |
| EOS_Initialize | Success，代码0 |
| 安装错误分类回调 | Success，代码0 |
| EOS_Platform_Create | 返回空句柄 |
| SDK 错误分类 | invalid_or_missing_clientid |
| EOS Connect 登录 | 未执行，未取得 EOS 身份 |
| BeginSession | 未执行，平台创建失败后结束 |
| EAC / 服务端认证 | 均未验证 |
| EOS_Shutdown | Success，代码0 |

本次探测耗时0.079秒。官方安装配置有 ProductId、SandboxId、DeploymentId，指向 RustClient.exe，但没有 Connect 的 ClientId 或 ClientSecret。工具只传入实际存在的产品标识，客户端凭据保持空，未填入服务器凭据或虚构值；SDK 通过日志回调报告缺少或无效的 ClientId。这解释了本次平台创建为何不能推进，不能将它改写成“有效身份已建立、EAC 最终拒绝”。

20:13:33 的初次探测同样得到 Initialize 成功、Platform_Create 为空、Shutdown 成功；为定位这个尚未解释的失败，随后只增加固定错误分类回调，得到上述结果。原生日志文本、产品配置值和凭据没有写入输出或公开报告。

## 本机接入包排查

用户说明有针对独立程序的授权配置，但忘记路径，授权直接查找。已核对系统实际桌面/文档/下载位置，在当前用户目录、可访问的 D/E/G 文件及指定开发目录搜索 EOS 头文件、SDK包和 EAC 构建配置名称；另外对桌面、文档、下载和开发目录内匹配产品/部署字段的配置做结构检查，没有找到完整 Connect 客户端配置或独立受保护构建包。

D/E 的部分目录有访问错误；未穷尽所有通用压缩包内部、程序内嵌配置或其他电脑。因此结论仅为本次范围内未找到，不否认用户持有授权包。游戏自带 Settings.json 的存在，不能代替那个独立程序的完整接入材料。

官方 Rust.exe、RustClient.exe、EAC 安装器和 EOS SDK 的 Authenticode 检查均为 Valid；这证明本机签名检查结果，不证明独立 Python 进程已受 EAC 保护。SDK 版本、ABI及布局检查通过，也不等于账号登录或会话认证。

## 工具、验证及状态

新增 tools/rust-research/eac-session-probe.py，仅诊断初始化和失败阶段。固定 SDK 哈希，安装配置只读；平台/接口失败时不会向空句柄调用 BeginSession。若接口可用，工具只做显式缺少 LocalUserId 的负向诊断，不能冒充完整会话测试。退出码0仅代表诊断完成并取得关闭结果。此轮真实执行没有走到该负向调用。

6项针对性 Python 测试通过，覆盖空句柄和原生包装异常下的清理、固定错误分类、SDK 成功不改变 eacVerified。它们使用假SDK验证清理约束；实际成功或失败取自上面的真实SDK运行，不能把单元测试当成有效EAC证据。

本助手没有修改启动配置、启动官方游戏、创建/停止玩家连接、登录账号、重启主服务或更改服务端。开始排查时只读API已出现19:55的39账号disconnect、19:56的39账号connect任务；它们早于本轮诊断。20:09:30只读核对39账号会话票据均inactive，38个已运行worker关闭，36个历史结果为eac_required。不能继续沿用19:51“旧服务器16连接保留”作为当前状态，也未擅自恢复这些连接。

后续实际接入需要找到完整、针对独立程序的客户端配置和受保护构建材料，或使用官方受保护客户端运行。当前数据不能证明仅靠已安装的产品标识可以让独立程序通过 EAC，也不能证明完成 EAC 就会改变公共人数。

官方参考：[会话参数及登录身份要求](https://dev.epicgames.com/docs/api-ref/structs/eos-anti-cheat-client-begin-session-options)、[BeginSession](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session)、[启动与完整性配置](https://dev.epicgames.com/docs/game-services/anti-cheat/using-anti-cheat)。本轮直接读取并解析官方页面的JSON正文；一个猜测的integration路径404已排除。JSON固定20项本地证据SHA，原始账号与搜索路径只在ignored work目录。
