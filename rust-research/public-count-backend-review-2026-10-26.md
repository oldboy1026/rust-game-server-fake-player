# Facepunch 公共人数：后台边界及服务器线索复核

2026-10-26。用户要求查后台统计逻辑，或核实其他服务器怎样让账号被统计。**已查询公开人数和公开资料；没有取得 Facepunch 私有后台、判定源码或逐账号采纳回执，也没有验证新的收录方案。** 公开查询权限不等于私有后台访问权限；本轮未尝试登录管理后台、获取私有凭据或利用漏洞。

## 直接查询结果

来源：[Facepunch playerCounts/rust](https://api.facepunch.com/api/public/steamServers/playerCounts/rust)。下表为2026-10-26 **14:44:24 北京时间**收到的同一份HTTP200响应；`Last-Modified`为14:39:44，`Age=280`，`CF-Cache-Status=HIT`。这是上游缓存批次，不是逐账号实时查询。

| 游戏地址（不是查询端口） | 公共人数 |
| --- | ---: |
| 61.147.247.25:40176 | 0 |
| 103.91.208.182:16666 | 11 |
| 202.189.21.58:30921 | 7 |

三个地址均在映射中，0不是“条目不存在”。原文SHA256：`3bd3f36cd4981962257ee68297db236878d949036f4e40cda6cb37b287c79676`。14:42:20的前一次读取与该响应正文哈希相同，不能当作两个独立新批次。

这证实用户举例服务器的公共接口确实返回11，**不能证明11来自其模拟账号**。该接口的响应正文仅有服务器地址到整数的映射，没有该服务器的SteamID名单、账号采纳理由、EAC回执、插件名称或人数来源。也不能由它定位“采用某种模拟技术且通过审核”的服务器。

## 已知逻辑与尚缺失的逻辑

本项目先前静态恢复的适用普通列表分支是 `max(0, min(cp, Facepunch公共人数))`，使用游戏连接端口匹配映射。代码版本、开关条件和证据见[查询链研究](count-query-reporting-deep-2026-10-24.md)。这说明本地正确发布cp并不能指定另一个公共源的返回值；本轮没有重新读取运行中游戏列表或当前客户端版本，不能把旧静态分支说成新的屏幕实测。

尚未取得的关键部分仍是：Facepunch后台使用哪些输入、如何关联和筛选账号、何时发布结果。Steam票据验证通过、OnPlayerConnected、Rust+的AppInfo.players、A2S/cp、自然上传HTTP成功、睡眠/清醒/动作和公共收录是不同证据。没有公开依据可保证增加聊天、持续输入或某个DLL就能完成收录；有效EAC也不能在缺少后台证据时被断言为唯一条件或充分条件。

## 新核对的官方资料

1. [Valve：认证与所有权](https://partner.steamgames.com/doc/features/auth)和[BeginAuthSession](https://partner.steamgames.com/doc/api/ISteamGameServer#BeginAuthSession)说明，开始验证不等于身份已确认，必须检查异步 `ValidateAuthTicketResponse_t`。这是Steam身份验证，文档没有规定Facepunch公共人数的算法。
2. [Valve：BUpdateUserData](https://partner.steamgames.com/doc/api/ISteamGameServer#BUpdateUserData)说明它更新已连接玩家在浏览器/匹配界面的资料，并明确写道：**“This is part of the old user authentication API and should not be mixed with the new API.”** 因此不应继续把它描述成新认证流程缺失的Facepunch登记接口。现有Rust代码中出现调用并不授权我们更改其认证流程；返回true同样不等于Facepunch采纳。
3. 同页 `CreateUnauthenticatedUserConnection` 明确说创建的是跳过验证的fake user/bot，且同样属于旧API；不能由“listed as playing”推出它符合Rust公共有效玩家条件。本轮仅阅读，未调用。
4. [Facepunch：创建服务器](https://wiki.facepunch.com/rust/Creating-a-server)将 `server.queryport` 说明为用于获取服务器资料和出现在浏览器列表的端口。这是可发现性条件，没有给出逐账号公共计数资格。[服务器标签](https://wiki.facepunch.com/rust/server-browser-tags)也未提供上述资格算法。

## 公开项目与其他服务器的证据边界

| 候选/线索 | 本轮实际取得的证据 | 能得出的结论 |
| --- | --- | --- |
| `Agude4Rust/Rust-Server-Fake-Player-Count` | GitHub元数据size=0；commits接口HTTP409，正文说明空仓库 | 宣传描述没有可复核实现；不当作已解决公共人数的项目 |
| `abspwgm/absolute-rust-server` | 固定提交 `47b318de9db970eab1fb269bda442b4e6dfd1e2c` 的目录、README、`tests/e2e/test_server_query.sh` 和 `scripts/rust-server` | 已读查询测试检查UDP监听端口；已读启动脚本启动Dedicated。选中源码未提供Facepunch逐账号采纳方法；未完整审计仓库，也未执行 |
| [Facepunch/webrcon issue28](https://github.com/Facepunch/webrcon/issues/28) | 提问如何无密码取得玩家人数；comments接口为空数组 | 是未获答复的问题，不能当官方公布统计算法 |
| Rust+ | 本轮沿用[上一份固定源码研究](rustplus-eac-review-2026-10-26.md) | 伴侣信息通道读取内部人数，未找到EAC/公共采纳转换 |
| 用户举例服务器103.91.208.182:16666 | 本轮仅公开聚合值11；此前关于批量账号的说法来自用户 | 未取得该服名单、身份分组、配置、插件源码或正常/独立连接的对照，无法归因 |

[查询测试固定源码](https://github.com/abspwgm/absolute-rust-server/blob/47b318de9db970eab1fb269bda442b4e6dfd1e2c/tests/e2e/test_server_query.sh)包含的“server query”不能直接等同于Facepunch统计验证。没有下载执行这些项目或安装其插件。

## 检索覆盖与限制

本轮32次只读HTTP读取，包括GitHub三组仓库检索、六组issue检索、官方文档、选中项目元数据/固定源码、一次公共聚合读取及一次带缓存头复核；逐项URL、状态、时间和正文哈希见[同名JSON](public-count-backend-review-2026-10-26.json)。HTTP200和结果数量不是有效技术证据数量。

- 精确 `"playerCounts/rust"` issue检索返回0，`"api.facepunch.com" "player" in:body`返回一个旧启动日志问题；不是代码搜索，也不能证明相关私有实现不存在。
- `facepunch backend`仓库搜索唯一返回项是使用拳头emoji的Go后端模板，与Facepunch游戏后台无关。未发现后台源码不等于证明它从未公开。
- 宽泛Rust/player/trusted搜索混有Rust语言、Garry's Mod和其他游戏，已排除，未把它们当Rust有效玩家规则。
- Bing两组结果均不相关，未用作算法依据。Facepunch支持站正文及搜索本次HTTP403，三个支持站公开文章API尝试HTTP404；未绕过限制。Wiki猜测的server-browser路径404也未作来源。
- 没有枚举私有接口、攻击后台、访问其他服务器管理端、重放票据/上报、伪造人数或生成EAC认证。

## 什么证据可以继续推进

最有价值的是**同一已获授权服务器**上的账号级对照，而非寻找一个聚合数更高的IP：管理员提供插件源码/可审核说明及正常配置，分别记录正常客户端和独立连接的Steam验证、实际EAC状态、完整入服及离服；在其余名单稳定的窗口里对照至少多个新公共批次。聚合变化仍不能独立识别被采纳的账号；若有逐账号官方诊断或Facepunch的正式说明，应优先使用。

如果正常官方客户端也漏计，可整理游戏/查询地址、服务器版本、Steam登录/认证失败摘要、各层人数及公共批次时间，通过[Facepunch支持入口](https://support.facepunchstudios.com/)提交真实漏计问题。本轮没有替用户发送工单或联系任何人。未经正式材料，不能把“有效账号已购买Rust”解释成Facepunch承诺必计。

本轮仅新增研究文档；保留运行中Web服务和已有账号连接，没有重启服务、创建/断开游戏会话或修改服务器配置。**公共人数修复、私有后台算法及独立有效Rust EAC会话仍未验证。**
