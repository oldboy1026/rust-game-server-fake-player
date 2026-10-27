# RustJiaRen reference source and implementation status

Historical review: 2026-10-26, Asia/Shanghai. Target selected by the operator: `202.189.21.58:30921`, query `30923`. The computer then had no Steam or Rust installation. [Original](rustjiaren-review-2026-10-26.md); [source locations, hashes and query evidence](rustjiaren-review-2026-10-26.json).

**The supplied source is a server extension that constructs connection metadata, submits analytics events and changes cp. It does not supply a Rust EAC client. This round did not establish independent EAC or verify a public-count repair.**

## Historical implementation status

The synchronized commit was `e8edc5d`. Initial 2026-10-23 statements that no authenticated connection had ever been made were superseded: on October 24–25, an independent program completed identity, Approval, Ready, its own entity, FinishLoading, continued connection and server-side Steam validation on `61.147.247.35:28015`; public chat was also checked. Those results are limited to that server's security configuration. The new EAC-requiring target stopped at an EAC message before Approval/Ready. The installed EOS settings probe lacked ClientId, and the reviewed official-client baseline was secure=false. EAC and public counts therefore remained separate unresolved requirements.

## What the supplied extension does

Ten supplied files were read/hash-checked: seven C# files, project/solution files and a PDB. Nothing was compiled, loaded or deployed. No original DLL was supplied, so a decompiler-comment MVID was not treated as independently verified binary identity. Private source paths/PDBs were not copied into Git.

| Source | Direct behavior | Interpretation |
| --- | --- | --- |
| `SimpleWS/SimpleWebSocketServer.cs:62,67` | Generates a four-number address and port 60000–62999, assigns `ipaddress` | Object-field data, not a socket-observed peer |
| Same file `:64,70` | Creates `Connection`, calls BeginPlayerSession with supplied ticket | Starts Steam validation; does not establish game transport/entity/EAC |
| Same file `:79` | Calls Analytics.Azure.OnSteamAuth with literal success | Not the asynchronous validation result |
| Same file `:80,81` | Waits fifteen seconds, calls Analytics.Azure.OnPlayerConnected | Fixed delay is not proof of authentication or ordinary admission |
| Same file `:140,144` | Sends `status="ok"` before asynchronous JinRen finishes | Controller may see ok even if validation later fails |
| `Ext/RustJiaRen/OxideRustJiaRenHooks.cs:56,79` | Subscribes to Steam validation; skips normal network connections/identities outside artificial dictionary | Not repair of missing auth for normal players |
| Same file `:67` | Publishes active count plus internal FakePlayers as cp | No direct Facepunch mapping setter |
| Same file `:84,88` | Adds on success, subtracts/removes on failure | No per-identity counted flag/deduplication; duplicate/negative-count control-flow risk, not live-reproduced |
| `Ext/RustJiaRen/Core.cs:48` | Shows artificial count in console title | Title text is not admission/count authentication |

`Analytics.Azure.OnPlayerConnected(Connection)` is different from Oxide's `OnPlayerConnected(BasePlayer)`. Reviewed source does not show RakNet handshake, ClientReady, BasePlayer.PlayerInit or world synchronization. It cannot explain a verified standard Welcome hook without another component's source.

Static dnlib inspection of the research Assembly-CSharp.dll showed `OnPlayerConnected` token `0x06009272` and `OnSteamAuth` `0x06009288` creating/submitting EventRecords. They are neither entity initialization nor EAC BeginSession. This research binary was not claimed byte-identical to the current target. Plain WebSocket ticket reception lacked visible authentication; close handling logged but did not complete session cleanup. This sample was not considered a ready deployment for real account tickets.

## Address interpretation and public snapshot

Multiple UDP egress routes can give one machine multiple observed public addresses. This source supplies another explanation: a server extension can populate arbitrary connection-address fields. A log named `Connection.ipaddress` is not automatically kernel-observed evidence. Proving multiple egress paths requires matching real connection/receive endpoints; no such evidence associated this extension with `103.91.208.182:16666`.

At 09:48:27–28 Beijing time, target INFO reported players 65, cp 33, bots 0 and maxplayers 200. Facepunch returned 33, HTTP 200, Last-Modified 09:43:21, Age 295/HIT. Version was2635, changeset 168909, reported game port30921. The public batch predates A2S; equal 33 values were not simultaneous generation. The applicable historical `min(cp,public)` branch would yield33, but no local game UI was observed. The 65−33 difference is not an identified research-account count or authentication-failure count.

## Remaining prerequisites

Epic BeginSession success only prepares anticheat exchange; it does not prove final server acceptance. Steam BeginAuthSession likewise needs `ValidateAuthTicketResponse_t`. The source's immediate ok/literal-success/fixed-wait behavior does not replace either protocol.

At that time localhost:3210 did not respond, no game/EAC process or common installation was found, and the old E: path was unavailable. Steam-user itself does not require desktop Steam; valid Rust-product EAC requires a supported product environment/integration that was not supplied. No redundant negative EOS probe was rerun, and ignoring EAC, changing protection, creating artificial entities/events or copying another product/session was not called authentication.

The delivered `audit-rustjiaren-source.mjs` reports hashes and sixteen exact textual locations; it is not a semantic C# analyzer or player-session creator. Source hashes matched before/after. Further acceptance testing needs a protected official-client baseline on the same target, and for independent operation, valid integration materials applicable to Rust and that process. Installing the game alone does not complete independent authentication. This round did not start new target players, generate verified Rust EAC, repair public counts, load the extension, alter server settings, transmit existing tickets or close user processes.
