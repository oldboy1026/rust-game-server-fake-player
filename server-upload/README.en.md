# Server Upload Package: Public-Population Refresh Experiment

[English](README.en.md) · [简体中文](README.zh-CN.md)

The separate [administrator simulated network view](RustTestNetworkView.en.md) displays explicitly marked test IP/latency values. It does not rewrite real connections, other plugins' logs, or public population; use it separately from this refresh tool.

**For a compiled DLL**, use the [RustPresenceBridge extension](rust-presence-bridge/README.en.md). Its binary is `rust-presence-bridge/dist/Oxide.Ext.RustPresenceBridge.dll` and belongs in `RustDedicated_Data/Managed`, unlike the `.cs` plugin below. They provide two delivery forms of the same ordinary-refresh experiment; choose one for a controlled comparison.

This newly written Oxide/uMod Rust plugin does not depend on the supplied RustJiaRen extension. It can resend ordinary Steam player information for one specified player who has already completed normal admission, then invoke the game's normal server-information update. An effect on Facepunch's public population requires a live controlled test; success has not been verified. It cannot admit an independent program stalled at EAC.

## Upload location

Find the directory running `RustDedicated`, usually the hosting panel's game root. Upload only:

```text
RustPresenceRefresh.cs -> <Rust-server-root>/oxide/plugins/RustPresenceRefresh.cs
```

Windows example: `D:\RustServer\oxide\plugins\RustPresenceRefresh.cs`.
Linux example: `/home/rust/server/oxide/plugins/RustPresenceRefresh.cs`.
Use the actual existing `oxide/plugins` directory and preserve filename/case. Do not place this source plugin in `RustDedicated_Data/Managed`, `HarmonyMods`, or `oxide/extensions`.

The server needs an Oxide/uMod version matching its Rust build. In the original preparation, only partial reference DLLs were available; this source plugin had not been compiled against the target's complete reference set or loaded on that server. Check Oxide's compilation log after upload. A vanilla server cannot directly load this `.cs` plugin.

## Load and commands

Upload normally triggers loading. Use the server console or an existing protected administrator RCON connection:

```text
oxide.load RustPresenceRefresh
rustpresence.snapshot
rustpresence.snapshot <17-digit-SteamID64>
rustpresence.refresh <17-digit-SteamID64>
```

For an already loaded plugin, update the file and run `oxide.reload RustPresenceRefresh`. Commands permit the server console, RCON, or administrators with authLevel >= 2. No additional port, plugin password, ticket, or account file is required. Output contains statuses and aggregate counts, not the target nickname, IP, or SteamID.

`normal_refresh_invoked` means the two ordinary methods returned. The original wrapper discards the underlying Steam boolean, so `backendAccepted: null` does not mean a public backend accepted the refresh.

`target_not_a_ready_authenticated_player` means the account has not completed normal connection/authentication/world loading. A program stalled at EAC falls into that category. First compare an ordinary official-client player; this plugin does not replace client authentication. With secure enabled, it additionally requires an EAC interface, player mapping, and local authenticated status. Those local checks alone are not proof of a complete valid EAC session.

Only one specified existing player is refreshed at a time, with a global 30-second cooldown. The plugin creates no Connection, fabricates no IP, invokes no fake authentication/analytics event, changes no `cp` directly, and alters no EAC setting. It has no periodic refresh, configuration change, or persistent output file. The ordinary update can still trigger other plugins' existing `OnServerInformationUpdated` hooks; their `cp` changes may therefore affect the final tags.

## Compare with the local dashboard

1. In `/rust`, query the target **game** IPv4/port. The historical example was `202.189.21.58:30921`, with query port `30923` or exact registration discovery. Optional A2S_PLAYER entries may be empty/hidden and do not supply verified SteamIDs.
2. Record Facepunch population, `cp`, A2S players, `Last-Modified`, `Age`, and observation time; run `rustpresence.snapshot <SteamID64>` on the server. These sources are not necessarily generated simultaneously.
3. Refresh only one test account that has completed ordinary admission, retaining the result. An independent program must actually complete admission first; the historical target's EAC blocker was unresolved.
4. Query again after 30 seconds and continue across **multiple new Last-Modified batches**. Let the backend update naturally; repeatedly reading one cached batch does not produce independent evidence. A missing mapping is unknown, not zero.
5. Use an official-client join/leave as a control and avoid simultaneous batch joins. An aggregate increase alone cannot identify the account counted or prove causation; use the actual server roster and controlled timing. An unchanged count alone also does not prove the refresh ineffective.

The Facepunch map is read-only; no public count-setting interface is provided. A2S players, `cp`, and Facepunch counts stay separate. The reference files' random addresses and FakePlayers are not verified real player connections.

## Remove

```text
oxide.unload RustPresenceRefresh
```

Then remove `oxide/plugins/RustPresenceRefresh.cs` to prevent loading on a later restart. Other plugins need not be deleted, and this plugin requires no server restart for removal. It owns no authentication session, patch, or timer.
