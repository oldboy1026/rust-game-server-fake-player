# Rust+ review: companion authentication, EAC and public counts

Historical review: 2026-10-26. [Original](rustplus-eac-review-2026-10-26.md); [fixed sources and evidence](rustplus-eac-review-2026-10-26.json).

Rust+ can provide maps, team information/chat and device control. **The reviewed public implementations did not provide valid EAC sessions for an independent Rust player or an interface that repairs Facepunch public counts.** This limited review does not prove that every private implementation is impossible.

The supplied conversation explicitly described the same unresolved “admitted but not counted” problem before suggesting Rust+. It supplied no successful counting/EAC demonstration, exact project, plugin, protection configuration or authentication method. A person's claim that a problem is unsolvable is experience, not a proof. Standard Rust+ is built into Rust Dedicated and does not inherently require a third-party player plugin.

## Sources examined

The review read metadata and 24 selected README, connection, credential/pairing and protobuf files across five fixed commits, without running their code or importing credentials:

| Project | Commit | Function |
| --- | --- | --- |
| liamcottle/rustplus.js | `75915f25fc7c1718f7c23c419953f4655840fade` | Node WebSocket companion library; suitable as an optional management channel |
| Pronwan/rustplus-desktop | `9e9f3e41c472ba11268bec56615e86b79adbc0a5` | Companion desktop UI using RustPlusApi |
| alexemanuelol/rustplusplus | `8f7300e4e3dd68392f2b01ead5d711697f63ac63` | Discord companion management bot based on rustplus.js |
| olijeffers0n/rustplus | `ca3d251fac2e4fb8a97419ac4baab00087e38e9e` | Python WebSocket/AppRequest companion library |
| HandyS11/RustPlusApi | `f61d403280c656addd103a09238e270e867cdc7e` | C# companion library, Steam web/FCM credentials and cameras |

No EAC game-client session implementation was found in the reviewed connection/pairing/protocol paths. Authentication-related class names do not establish EAC capability, and selected-file review was not called a whole-repository audit.

## What the protocol authenticates

[Official companion documentation](https://wiki.facepunch.com/rust/rust-companion-server) describes a separate TCP port, inspectable through `app.info` and configured with `app.port`. Game and A2S ports must not be guessed as companion ports; no target-port scanning was performed. rustplus.js creates `ws://server:port` or a companion proxy URL. `AppRequest` carries a sequence, `playerId`, `playerToken`, and requests such as getInfo, getMap, getTeamInfo and sendTeamMessage. These are separate from the worker's game transport, Steam admission and EAC exchanges.

RustPlusApi explicitly describes its Port as the companion port, and PlayerToken as pairing credentials. SteamLoginService obtains credentials from a Facepunch companion callback; “native credential retrieval” does not mean generating Rust EAC proof. `getNexusAuth` returns `serverId`/`playerToken`: the protocol 2635 server checks Nexus `appKey`, calls `UserPersistance.GetOrGenerateAppToken`, and writes an app token. It is not AntiCheatClient BeginSession, message validation or client integrity evidence.

## Direct internal-count evidence

Static inspection of the already hashed protocol 2635 Assembly-CSharp.dll showed `CompanionServer.Handlers.Info.Execute()` reading `BasePlayer.activePlayerList.Count` into `ProtoBuf.AppInfo.players`, then returning the companion response. This path reads an internal list; it does not submit, increase or authenticate a Facepunch public count. Rust+ showing five players cannot prove that the public map accepted five.

Reviewed AppRequest fields contain no public-count increment, EAC registration or ordinary BasePlayer walk/jump input. `cameraInput` controls a remote camera/device rather than a normal player. Team information is limited by permissions and is not a guaranteed complete server roster.

## EAC documentation and research implications

The rendered Epic documents for [BeginSession](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session), [AntiCheatClient](https://dev.epicgames.com/docs/api-ref/interfaces/anti-cheat-client) and [Using Anti-Cheat](https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/using-anti-cheat) describe product-configured modules/bootstrap, integrity catalogs/keys, callbacks and client/server session exchange. BeginSession success means exchange can begin, not that the Rust server accepted the session. Missing/unloaded integrity catalogs prevent protected multiplayer admission.

No public companion-token conversion replaces those conditions. Configuring an unrelated EOS product does not imply acceptance by Rust's product. Steam login, a Rust Steam ticket, companion pairing and EAC must be tested separately. Official material enabling an independent process for Rust was not obtained.

Rust+ remains useful for optional map/internal-count/team/device observation, with the actual app port and valid pairing permission. It is not the reviewed path to create a game player, valid EAC or public-count repair.

This round made 49 successful HTTP reads and rendered three official documents. Search results included 140 rustplus repositories, of which the first twelve were discovery candidates; EAC-specific repository/issue searches returned zero, but this is not a proof of universal absence. Broad searches mixed the game, language and similarly named tools. Exact URLs, commits and hashes are in the JSON; raw material remains ignored locally. No Rust+ dependency, pairing, third-party credential login, target companion connection, plugin/configuration change, service restart or account change was performed. `eacVerified` was not set true and displayed counts were not altered to hide discrepancies.
