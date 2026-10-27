# Local Player-Count Diagnostics

[English](local-count-diagnostics.en.md) · [简体中文](local-count-diagnostics.md)

`CountDiagnostics.cs` is read-only plugin source for a local Oxide Rust test server. Version 0.1.0 compiled/ran on the pre-update local server with an all-zero empty baseline. Version 0.1.1 added secure/authentication aggregates and compiled offline. Current source 0.1.2 additionally reports Steam-interface/backend login state; it compiled against 17 local references with zero errors/warnings but had not been deployed/run. Earlier runtime evidence does not validate the current source version.

When needed, put it in the **local test server's** `oxide/plugins/CountDiagnostics.cs` for Oxide loading. Manually request one sample from the server console, local test RCON, or an authLevel >= 2 administrator's client console:

```text
countdiag.snapshot
```

It takes no arguments and returns one JSON object. Ordinary players receive `{"error":"forbidden"}`. Permission level is used for authorization only and is not returned. Removing the local source file lets Oxide unload it.

| JSON field | Meaning |
| --- | --- |
| `utc` | Sample UTC time |
| `activeListEntries` | Raw `BasePlayer.activePlayerList.Count` |
| `activeNonNull` | Non-null managed references; ReferenceEquals does not remove Unity-destroyed references still present |
| `activeSleeping` / `activeAwake` | Non-null references with IsSleeping true/false |
| `activeReceivingSnapshot` | Non-null references with IsReceivingSnapshot true |
| `activeConnected` | Non-null references with IsConnected true |
| `sleepingListEntries` | Raw `BasePlayer.sleepingPlayerList.Count` |
| `networkConnectionEntries` | Raw `Network.Net.sv.connections.Count` |
| `networkConnectedConnections` | Non-null connections with connected true |
| `networkAuthenticatedConnections` | Non-null connections with isAuthenticated getter true |
| `serverSecure` | Actual running Network.Net.sv.secure boolean |
| `serverEncryption` | Actual running Network.Net.sv.encryption integer |
| `steamInterfaceValid` | Steam game-server interface pointer is non-null |
| `steamLoggedOn` | Read-only native backend login when interface is valid; otherwise null |
| `interfaceAvailable` | EACServer.ValidInterface reference availability |
| `eacAuthenticatedConnections` | Non-null connections whose EACServer.IsAuthenticated result is true |

Unavailable collections/server objects produce null. `activeSleeping + activeAwake = activeNonNull`; snapshot/connection states can overlap sleeping. Sleeping and active collections are independently read and must not simply be added to infer population. Network entries can include accounts still authenticating/loading and do not equal admitted players.

In the inspected DLL, IsReceivingSnapshot reads player flag 8, IsSleeping reads flag 16, and IsConnected checks server/player connection references. None validates an effective EAC session or Facepunch eligibility.

`serverSecure/serverEncryption` read running instance fields, not merely same-named configuration values; they do not prove every connection is protected. The network isAuthenticated getter compares five local authentication-status strings. The plugin calls the getter without extracting/outputting those strings. That differs from the EAC status dictionary and does not establish valid protected EAC.

`steamInterfaceValid` means the local interface exists, not that backend login succeeded. `steamLoggedOn` reads `SteamServer.LoggedOn -> BLoggedOn`, helping distinguish a locally responsive query listener from Steam backend login. It triggers no login, reconnect, or report and proves no individual account/EAC/Facepunch acceptance.

Static inspection confirmed EACServer.ValidInterface and IsAuthenticated(Connection) are public static read-only queries: the former compares a reference with null; the latter uses TryGetValue and checks local enum value 2. Their static initializer creates local dictionaries/defaults without client registration or authentication. The two fields are sampled separately; interface availability does not rewrite authentication totals. These cached states do not prove current backend recognition.

The plugin only traverses active/network objects to sum listed state. It reads no identity, coordinate, or endpoint and serializes only explicitly selected aggregates, not raw game objects. It invokes no authentication/registration/message API, creates/wakes no player, changes no A2S/Steam tags or analytics, fabricates no count, writes no file, and has no timer/automatic sampler. Output excludes account/player/entity IDs, permission levels, authentication text, coordinates, endpoints, and tickets.

A local server not publicly registered permits comparisons with actual local client state, **not conclusions about Facepunch inclusion or public eligibility rules**. Manually sample normal join, completed loading, sleeping, and departure as separate stages and record client behavior; the plugin performs none of those actions.

## Static compatibility evidence

Local analysis copies inspected on 2026-10-24:

| Assembly | Inspected members |
| --- | --- |
| Assembly-CSharp.dll | Public static activePlayerList/sleepingPlayerList; public IsSleeping, IsReceivingSnapshot, IsConnected; public static EACServer.ValidInterface/IsAuthenticated |
| Assembly-CSharp-firstpass.dll | Public static Network.Net.sv of type Network.Server |
| Facepunch.Network.dll | Public List of connections, secure Boolean, encryption Int32; Connection.connected Boolean, authLevel UInt32, isAuthenticated getter |
| Facepunch.Console.dll | Public ConsoleSystem.Arg.Connection, IsRcon, ReplyWith(object), whose overload JSON-serializes the selected object |
| Facepunch.System.dll | Public ListHashSet Count/GetEnumerator |
| Facepunch.Steamworks.Win64.dll | Public static SteamServer.IsValid/LoggedOn; LoggedOn reads BLoggedOn |
| Oxide.Rust.dll / Oxide.CSharp.dll | Public RustPlugin and Info/Description/ConsoleCommand attributes |

dnlib read metadata and method IL without executing the game assemblies. Intermediates are in ignored `work/steam-ticket-review/countdiag-metadata.txt`. Recheck after updates; static inspection does not replace actual compilation/runtime results.

The 0.1.1 offline build used existing .NET SDK 10.0.201 / Roslyn 5.3.0-2.26153.122, directly invoked through a response file against local Managed metadata. There was no NuGet restore, download, game execution, installation, or RCON connection. Adding the initially missing existing Facepunch.UnityEngine.dll reference produced a successful build with no source change/errors/warnings. Source and all references retained the same before/after hashes.

Ignored `work/countdiag-build-safe.json` records source hash, compiler, 16 actual reference hashes, diagnostics, and output path; the response file/binary remain under `work/countdiag-build/`. Build success checks syntax, accessible members, and reference types, not actual Oxide loading. Deploy source only, not the generated or third-party DLLs.

Version 0.1.2 has separate `work/countdiag-build-012-safe.json` and `work/countdiag-build-012/`, preserving 0.1.1 evidence. Its seventeenth reference is existing Facepunch.Steamworks.Win64.dll. Sanitized evidence is `rust-research/count-diagnostics-build-0.1.2-2026-10-24.json`; source SHA-256 is `5e6df0256bc933e615cae9a621770e2423e2461fff4b7fcb38d9cc1c93a51f3a`.
