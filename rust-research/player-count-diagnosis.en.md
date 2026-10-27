# OnPlayerConnected versus Rust browser population

Historical diagnosis: 2026-10-23, Asia/Shanghai, with October24 supplement. [Original](player-count-diagnosis.md); [IL/hash evidence](player-count-evidence.json); [source metadata](player-count-sources.json).

The reported Welcome.cs OnPlayerConnected event and persistent presence provide more evidence than an initial connection request, but the complete plugin/controller, current target runtime and simultaneous counts were unavailable. **If the event follows standard Oxide injection and the player remains in the normal active list, stock publication should include it in cp.** No visible game window, program control or no movement alone is not an established rule for permanent omission. cp and A2S_INFO players are different fields; the final browser source needs client evidence.

Reference analysis used app 258550/depot 258551/manifest 93946663446561466 and Oxide commit `aa85087dbf8ae6129d0c28da7680915f3ff56895`, not target-server binaries. BasePlayer.PlayerInit(token0x06001aa1, IL003D–0043) first adds the player to activePlayerList. Oxide's IOnPlayerConnected injection index225 subsequently calls the public hook. ServerMgr.UpdateServerInformation formats `activePlayerList.Count` into cp and sets GameTags. StartSteamServer schedules it after 2 seconds, every 30 seconds. That is server publication cadence, not a guaranteed end-to-end browser refresh deadline; Steam/proxy/browser caches may add delay.

Another normal path is Auth_Steam success→IPlatformService.UpdatePlayerSession→SteamPlatform.UpdatePlayerSession→SteamServer.UpdatePlayer→nativeBUpdateUserData. BeginPlayerSession starts BeginAuthSession; EndPlayerSession ends it. The managed UpdatePlayer discards a possible false return. This exposed a diagnostic gap, not evidence that the target failed or that failure freezes A2S counts. censorplayerlist randomizes the name but still calls update. Global Steam PlayerCountAsync is not one server's count.

## Compare the same endpoint and time window

Record before entry, after entry and across several publication periods: actual admin status/active/network presence; GameTagscp/mp; A2S players/max/bots; and manually refreshed game-browser display/time. A read-only query is:

```powershell
node .\rust-research\query-server.mjs --host 202.189.21.138 --port 28017
```

It does not admit a player or establish which SteamID is counted. If active/cp/A2S all rise but UI does not, check browser/cache/endpoint. If active/cp rise but A2S does not, inspect Steam native publication/session/profile and proxies. If active rises but cp stays stale across cycles, inspect scheduling/tag overwrites/another instance. If Welcome fires but identity is absent from normal active state, inspect artificial hook calls, NPC/nonstandard objects or stale prompts. These are diagnostic branches, not proven causes.

Normal hooks/persistence still do not reveal whether another tool uses independent protocol, hidden/remote official processes or server-side cooperation. Batch control does not prove clientless operation or EAC bypass. No target login or valid EAC was established in this report.

October24 supplement: four replies on a different current server `61.147.247.35:28015` query 28016 were players/cp 14/12, 14/12, 12/10, 12/10, bots 0. This directly proves the fields can differ in one reply. It was not a retest of the original target, and no internal roster/plugin/browser refresh identified the cause. Later [deep query-chain work](count-query-reporting-deep-2026-10-24.en.md) adds the independent Facepunch cap to this early diagnosis.
