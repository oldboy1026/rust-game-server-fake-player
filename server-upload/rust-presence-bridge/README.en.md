# RustPresenceBridge: Compiled Server Extension DLL

[English](README.en.md) · [简体中文](README.zh-CN.md)

This is an independent implementation based on the extension-loading mechanism and Steam-reporting paths inspected in the reference RustJiaRen DLL. It supports an ordinary-reporting refresh experiment for one specified real account alongside this project's Node.js program. **It compiled successfully; target-server loading and a public-count change were not verified in the recorded preparation.**

## 1. Download and place

Deliverable: `dist/Oxide.Ext.RustPresenceBridge.dll`. Keep its name unchanged.

Stop the server and place only that DLL under the directory running RustDedicated:

```text
<Rust-server-root>/RustDedicated_Data/Managed/Oxide.Ext.RustPresenceBridge.dll
```

Windows example: `D:\RustServer\RustDedicated_Data\Managed\Oxide.Ext.RustPresenceBridge.dll`.
Linux example: `/home/rust/server/RustDedicated_Data/Managed/Oxide.Ext.RustPresenceBridge.dll`. Linux needs compatible Oxide/Rust managed assemblies; compilation used Windows references and Linux loading was not verified.

This is an **Oxide extension DLL**, unlike the `.cs` source plugin. Do not put it in `oxide/plugins`, `oxide/extensions`, or `HarmonyMods`. The server must already have Oxide/uMod compatible with its current Rust version; a vanilla server cannot load it. Do not replace Oxide.Core.dll, Oxide.Rust.dll, or an official DLL with this deliverable.

If `Oxide.Ext.RustJiaRen.dll` is installed, back it up and move it out of the load directory while stopped so its FakePlayers/`cp` modifications cannot confound the comparison. Then start the server. This extension does not support hot reload; installation, updates, and removal use a full restart.

Logs should identify the RustPresenceBridge extension and `Rust Presence Bridge v0.1.0` core plugin. Confirm actual loading with logs and the commands below; compilation alone does not prove runtime compatibility.

## 2. Server console or existing administrator RCON

```text
rustpresencebridge.snapshot
rustpresencebridge.snapshot <17-digit-SteamID64>
rustpresencebridge.refresh <17-digit-SteamID64>
```

Commands permit the server console, RCON, or authLevel >= 2 administrators. No extra port or Steam ticket input is needed. JSON output includes bridge/version/status, time, aggregate counts, and target connection state; it omits the target SteamID, nickname, IP, and tickets.

Snapshots show activePlayers, networkConnections, publishedTags, and local Steam/EAC state. EAC local status under `secure=false` is not evidence of protected authentication.

Refresh requires the target in the active BasePlayer list; its `net.connection` must be the same object present in the real `Network.Net.sv.connections`, with the requested SteamID, a healthy authenticated network connection, and completed world snapshot. Secure servers additionally require the EAC interface, player mapping, and local authentication state. The extension invokes only installed-game `UpdatePlayerSession(ulong,string)` and the original zero-argument `UpdateServerInformation()`, with a global 30-second cooldown. A target absent or stalled at EAC is rejected.

With `normal_refresh_invoked`, both `playerUpdateReturned` and `serverInformationReturned` should be true. The original Steam wrapper returns void, so `backendAccepted` **always remains null**. It is not a native Steam boolean, EAC receipt, or Facepunch acceptance receipt. Failure may occur after a partial call sequence; there is no automatic retry.

| Status | Meaning |
| --- | --- |
| `snapshot` | Local snapshot captured |
| `normal_refresh_invoked` | Both ordinary refresh methods returned; backend outcome unknown |
| `target_not_a_ready_authenticated_player` | Missing target, mismatched connection, unauthenticated state, or still loading |
| `protected_target_not_authenticated` | Required local EAC state missing under secure |
| `incompatible_runtime_or_snapshot_failed` | Reference types/members do not match, or server is not ready; retain load logs and original status for diagnosis |
| `refresh_failed_or_partially_invoked` | Inspect the two Returned fields for partial completion |
| `cooldown_30_seconds` | Wait before another manual attempt |

## 3. Use with the Node.js application

Run from the repository root with Node.js 22+ and the installed `steam-multi-account` dependencies. The server's existing WebRCON must be reachable. **RCON, game, and query ports have different purposes: do not treat a query port as RCON.** The driver does not change server RCON configuration.

Set existing connection information in local PowerShell, without echoing the password:

```powershell
$env:RUST_RCON_HOST = '127.0.0.1'
$env:RUST_RCON_PORT = Read-Host 'Existing WebRCON port'
$taskRconSecret = Read-Host 'RCON password' -AsSecureString
$env:RUST_RCON_PASSWORD = [Net.NetworkCredential]::new('', $taskRconSecret).Password
# If the existing WebRCON uses TLS, set $env:RUST_RCON_TLS='1'; default is ws.
```

Continue using the existing protected management channel. For an SSH tunnel, use `127.0.0.1` and the tunnel port. There is no need to provide the password in chat. The examples below use local game/query ports; substitute the actual endpoints.

Read an overall snapshot without refreshing:

```powershell
node tools/rust-research/presence-bridge.mjs --host 127.0.0.1 --port 28015 --query-port 28017 --action snapshot --out work/presence-before.json
```

Read a local project account, replacing `account1` with its internal management ID:

```powershell
node tools/rust-research/presence-bridge.mjs --host 127.0.0.1 --port 28015 --query-port 28017 --account account1 --action snapshot --out work/presence-account.json
```

Only after the independent program has actually completed normal admission, refresh one account manually:

```powershell
node tools/rust-research/presence-bridge.mjs --host 127.0.0.1 --port 28015 --query-port 28017 --account account1 --action refresh --wait-seconds 35 --out work/presence-refresh.json
```

`--account` reads the SteamID from the local service. Refresh additionally requires an `entered_game` project session with the matching game address, or it rejects locally. Custom `PORT`/`STEAM_DATA_DIR` values are inherited. Alternatively use `--steam-id <17-digit-SteamID64>` for an ordinary official-client control; the server independently verifies its real connection. Do not supply both target forms.

The driver sends only the command and target SteamID, not Steam passwords, API keys, cookies, or tickets to RCON. RCON credentials are excluded from results, which retain aggregate query data and limited extension state. A `rcon_result_unknown` timeout may follow execution and is not retried automatically. Clear temporary local secrets afterwards:

```powershell
Remove-Item Env:RUST_RCON_PASSWORD
Remove-Variable taskRconSecret
```

## 4. Interpret public-population results

The driver records before/after Facepunch/`cp`/A2S counts, `Last-Modified`, and `Age`, and calculates `publicCountDelta` and `publicBatchChanged`. Waiting 35 seconds does not guarantee a new public batch. If Last-Modified is unchanged, continue manual observations across several new batches. An aggregate delta does not prove a particular account was accepted or the refresh caused it, so `publicCountChangeVerified` remains false.

The extension has no public count-setting interface. The reference DLL's artificial Connections, random addresses, manual OK analytics events, and FakePlayers/`cp` additions are not verified ways to update Facepunch population and were not copied here. Existing plugins may still modify `cp` through ordinary update hooks and must be included in the comparison.

The historical independent-program attempt at `202.189.21.58:30921` stopped at EAC. This extension creates/transfers no EAC client session and does not label that state as successful admission. First use a normally admitted official-client account to validate deployment, state, and ordinary refresh calls, then test an independent connection that meets the same admission conditions.

## 5. Build, provenance, and remove

Sources are `Extension.cs`, `RuntimeAdapter.cs`, and `Json.cs`:

```powershell
.\server-upload\rust-presence-bridge\Build.ps1 -ReferenceDirectory 'D:\RustServer\RustDedicated_Data\Managed'
```

The original build referenced Oxide.Rust 2.0.7839, Oxide.Core 2.0.4143, and local game reference DLLs. Runtime checks constrain game types, members, and method signatures; unknown versions fail without arbitrary member writes. Build provenance and binary SHA-256 are recorded in `dist/build.json`. The reference DLL was only statically inspected for metadata/IL, not executed, patched, or redistributed.

To remove: stop the server, move `RustDedicated_Data/Managed/Oxide.Ext.RustPresenceBridge.dll` out, and restart. No added configuration, database, background server, artificial player, or persisted ticket needs cleanup.
