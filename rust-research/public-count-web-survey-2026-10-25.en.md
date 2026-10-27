# Rust public player counts: review of online projects and references

2026-10-25. At the user's request, this round searched GitHub, official Steam documentation, public Facepunch resources, and plugin communities again, then reviewed relevant projects individually. **The reviewed material did not contain a verified, complete implementation that fixes Facepunch public player counts.** Useful findings were verifiable query paths, the data sources used by different tools, and projects that must be excluded as unrelated matches.

The record contains 127 public HTTP/API requests, of which 103 returned HTTP 200; this is not the number of useful technical sources. It includes 22 repository searches, 7 issue searches, 2 commit searches, and reviews of the 13 projects below at different depths. The table distinguishes source-code, README, and repository-metadata reviews. Full queries, status codes, versions, individual findings, and evidence hashes are in the [companion JSON](public-count-web-survey-2026-10-25.json).

## Most useful source-code findings

**GameDig's Rust count comes from `cp`.** The [Rust parsing branch at the fixed commit](https://github.com/gamedig/node-gamedig/blob/41f3773cc46fceb433931cfea4bb8b9001d678f5/protocols/valve.js#L145) parses the `cp` tag as an integer and assigns it to `state.numplayers`; the [Rust configuration](https://github.com/gamedig/node-gamedig/blob/41f3773cc46fceb433931cfea4bb8b9001d678f5/lib/games.js#L2603) selects the `valve` protocol. That branch does not query Facepunch `playerCounts`. Consequently, GameDig, a monitoring bot, or a website using it might show 14 while an in-game list subject to the public cap shows 3 simply because they read different sources. This is not a fix that makes the public count become 14.

**The reviewed upstream code does not justify updating `steam-user` as a fix.** At upstream HEAD `02818bd08090b58ff54f1d9ce0073319b8e1eef7`, the retrieved `gameservers.js`, `appauth.js`, `apps.js`, and README all matched the local files after line-ending normalization. The [server-query wrapper](https://github.com/DoctorMcKay/node-steam-user/blob/02818bd08090b58ff54f1d9ce0073319b8e1eef7/components/gameservers.js#L39) still maps `auth_players` to `players` and retains the older IP-object/port mapping; this project already has an exact-target query adapter for those differences. The [game-activity sending implementation](https://github.com/DoctorMcKay/node-steam-user/blob/02818bd08090b58ff54f1d9ce0073319b8e1eef7/components/apps.js#L75) provides no receipt confirming backend acceptance. No missing public-count patch was found in those four upstream files; this does not exclude other branches or unreviewed commits.

**Steam's two player fields must still be distinguished.** The [schema fixed to 2026-09-09](https://github.com/SteamDatabase/Protobufs/blob/f5b0600750b2d5634c78f654845b6d5954f700db/steam/steammessages_clientserver_gameservers.proto#L95) separately defines `auth_players=3`, `players=8`, `query_port=2`, and `game_port=9`. Field names and numbers are not Facepunch's eligibility algorithm. These definitions do not explain the previously observed difference between a real CM authenticated count of 14 and a public count of 3.

**Third-party Rust server browsers may display another source.** The [K4RLis main page](https://github.com/K4RLis/rust-server-browser/blob/aad7d3b4ea036339874610404d2a7bb0ec2e7221/index.html#L334) uses BattleMetrics. Its optional [Steam adapter](https://github.com/K4RLis/rust-server-browser/blob/aad7d3b4ea036339874610404d2a7bb0ec2e7221/index.html#L713) displays Steam's `s.players` directly, while its [Worker](https://github.com/K4RLis/rust-server-browser/blob/aad7d3b4ea036339874610404d2a7bb0ec2e7221/cloudflare-worker.js#L42) queries `IGameServersService/GetServerList`. [rust-servers-io](https://github.com/zachrynewycz/rust-servers-io/blob/1e70151b83d0bda970a0ce0df0831001743c4090/app/api/getPopularRustServers.ts#L10) also reads BattleMetrics. None of this code implements the generation of Facepunch public counts. Comparisons must name the source; an increase on a third-party page does not establish an increase in the game's public list.

## Project screening results

| Project | Review depth | Finding and limits |
| --- | --- | --- |
| [gamedig/node-gamedig](https://github.com/gamedig/node-gamedig) | Source reviewed at a fixed commit | Rust uses Valve/A2S and takes its count from the `cp` tag; this is not Facepunch's public count. |
| [DoctorMcKay/node-steam-user](https://github.com/DoctorMcKay/node-steam-user) | Fixed-commit source reviewed and compared locally | `auth_players` and activity-sending paths are clear; all four reviewed files match the local copies. |
| [SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs) | September 2026 schema reviewed | `auth_players`, `players`, game port, and query port are separate fields. |
| [K4RLis/rust-server-browser](https://github.com/K4RLis/rust-server-browser) | HTML and Worker source reviewed | Uses BattleMetrics plus optional Steam GetServerList, displaying each source's `players` directly. |
| [zachrynewycz/rust-servers-io](https://github.com/zachrynewycz/rust-servers-io) | Source reviewed at a fixed commit | Requests BattleMetrics player counts. |
| [NexExMachina/Paranoid.BlacklistMonitor](https://github.com/NexExMachina/Paranoid.BlacklistMonitor) | Source reviewed at a fixed commit | Reads `Servers.Banned`; it is a ban-monitoring project. |
| [Asbra/RustInterceptor](https://github.com/Asbra/RustInterceptor) | Fixed-commit README and directory reviewed | A 2016 proxy/parser for a normal Rust client, not a current independent-client implementation. |
| [pede/Anti-AFK-Rust](https://github.com/pede/Anti-AFK-Rust) | Source reviewed at a fixed commit | Uses Windows SendKeys and requires an existing game client. |
| [niktodrugoi/bot_rust](https://github.com/niktodrugoi/bot_rust) | Description and repository metadata reviewed | A Telegram bot for Facepunch commit notifications. |
| [community-network/server-bot-rust](https://github.com/community-network/server-bot-rust) | Description and repository metadata reviewed | A Battlefield status bot written in the Rust programming language. |
| [RELAY-CN/FakePlayer](https://github.com/RELAY-CN/FakePlayer) | Description and repository metadata reviewed | A project for Rusted Warfare, a different game. |
| [ProPython244/FakePlayersz](https://github.com/ProPython244/FakePlayersz) | Repository API reviewed | Its promotion mentions Rust, but repository size was 0, the commits endpoint returned 409, and README returned 404; no implementation could be reviewed. |
| [ThatRatDev/Boiler](https://github.com/ThatRatDev/Boiler) | Description and repository metadata reviewed | A Godot wrapper for loading Facepunch.Steamworks native libraries. |

The [original Anti-AFK code](https://github.com/pede/Anti-AFK-Rust/blob/5f18dd03fa86247cda1ffaca8be266dd67824ca3/antiafk_rust/Form1.vb#L22) only sends the D key; it was not downloaded and executed. The [blacklist monitor](https://github.com/NexExMachina/Paranoid.BlacklistMonitor/blob/2bcd0de0a130f00d635e4eb3a75a937707761aa6/index.js#L72) reads `response.data.Servers.Banned`, not `playerCounts`. Keywords such as Facepunch API, FakePlayer, Rust, and headless do not replace an actual call chain or runtime evidence.

## Relationship to official documentation and existing experiments

[Valve's authentication documentation](https://partner.steamgames.com/doc/features/auth) distinguishes ticket acquisition, server-side validation startup, asynchronous validation results, and cancellation/closure when authentication ends. This project has observed real validation and server admission. This review found no requirement to call an additional player-count authentication function after successful validation.

The [official AdvertiseGame documentation](https://partner.steamgames.com/doc/api/ISteamUser#AdvertiseGame) states:

> When you are using Steam authentication system this call is never required, the auth system automatically sets the appropriate rich presence.

This describes normal authentication and rich presence in the native SDK. It does not establish that a custom CM client reproduces every internal association, and it does not specify Facepunch's backend count formula. It supports treating manual association as a hypothesis rather than a required fix.

In the [three-stage live experiment from the same day](presence-association-experiment-2026-10-25.en.md), the real identity association matched, but two newer public datasets remained at 3 while the roster was stable. This public-source review found no interface that overturns that observation or directs the backend to count that account. The server's `cp` was already correct; rewriting the same `cp` has no established basis for fixing a different public source.

Facepunch's [community plugin guidelines](https://support.facepunchstudios.com/hc/en-us/articles/360009062817-Guidelines-for-community-servers-using-plugins-mods) discuss Community/Modded classification. They do not describe the public-count filtering algorithm and are not used here as algorithm evidence.

## Search limitations

- Bing requests succeeded, but several results were unrelated and were excluded. Requests to Google/Jina, DuckDuckGo, Brave, Yahoo, and raw.githubusercontent had connection failures. Required GitHub source was instead read through the public contents API at fixed commits.
- grep.app returned 429; Sourcegraph, Mojeek, and uMod returned 403. Access restrictions were not bypassed. No GitHub account or user key was used for code search.
- Four query URLs on the Facepunch commits site showed the same latest commits, so no effective filtered results were obtained. This does not establish that relevant implementation is absent from the complete official commit history. Three attempted wiki paths returned 404 and were excluded as supporting sources.
- The selected Codefling title searches returned 0, and broad search results were noisy. This does not rule out other names, private plugins, or unpublished implementations.
- Repository searches covered returned candidates and selected projects, not every GitHub repository. Failure to find a reproducible fix does not establish that nobody else can implement one.

## Further directions that can be verified

1. In the next bounded comparison, record the test account's actual `playingState/blocked` and available self game-activity state from login onward. This would fill the missing visibility into acceptance from the previous round. A failed query remains unknown; successful sending must not stand in for backend acceptance.
2. Compare a normal official client and an independent connection on the same registered target with a stable identity roster. Record public batches, Steam authentication, admission, sleeping/input state, and valid EAC separately. Counts on websites using different sources must not be used as acceptance criteria.
3. Choose a fix based on an observed reporting gap or legitimately obtained evidence of per-account acceptance. The available material still does not establish Facepunch's backend rules, so these projects do not justify a player-count modification DLL, authentication replay, or fabricated activity events.

This round consisted only of read-only online searches and source-code analysis as text. It did not log into Steam, create or stop game connections, load DLLs, execute downloaded projects, change server configuration, or send bot/Discord notifications. Existing user sessions remained under the user's management.
