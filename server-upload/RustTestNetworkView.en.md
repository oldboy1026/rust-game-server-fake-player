# RustTestNetworkView: Administrator Simulated Network View

[English](RustTestNetworkView.en.md) · [简体中文](RustTestNetworkView.zh-CN.md)

**This is a separate test view whose output is explicitly marked as simulation. It changes neither `Connection.ipaddress`, real latency, other plugins' player logs, Rust status, A2S, Steam/EAC, nor Facepunch population.** It was not deployed to the target server and is not a public-population fix.

It generates simulated IPs and 10-200 ms simulated latency only for administrator-selected accounts that are currently connected. Addresses use the documentation-only ranges `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24`; selected entries are unique. Default duration is 15 minutes, maximum 60 minutes, and maximum selection 50 accounts. Cleanup runs every 30 seconds and checks expiry/disconnection/replaced connections when queried too. Entries do not survive connection changes or server restarts.

## File location

On a Rust server with compatible Oxide/uMod, copy the adjacent `RustTestNetworkView.cs` to:

```text
<Rust-server-root>/oxide/plugins/RustTestNetworkView.cs
```

Oxide compiles and loads the source. **Do not** put the locally built validation DLL in Managed, extensions, or HarmonyMods. Vanilla servers do not directly support this plugin; actual load results determine target-version compatibility.

## Commands

Only the local server console or an existing protected RCON connection may invoke commands. In-game players, including authLevel 2 administrators, are rejected. No new password/API/port or uploaded account file is required.

```text
oxide.load RustTestNetworkView
testnetwork.add <test-account-SteamID64>
testnetwork.add <test-account-SteamID64> 10
testnetwork.snapshot
testnetwork.rotate
testnetwork.remove <test-account-SteamID64>
testnetwork.clear
oxide.unload RustTestNetworkView
```

`add` creates or renews an entry; repeated addition preserves its simulated values. `rotate` reallocates values for selected entries without extending expiry. `snapshot` returns TEST aliases, `source=simulation`, `simulated=true`, `simulatedIp`, and `simulatedPingMs`. Entries reveal no real IP, account ID, or nickname. Since underlying objects are unchanged, clearing/unloading needs no restoration of real connections.

The plugin writes no account configuration/data files, makes no network connection, and does not itself log IPs or identities. The server, RCON client, or other plugins may log command arguments entered by the administrator; protect such records as private data. Deployment does not require server-login credentials in source, examples, or Git.

After unloading, move `oxide/plugins/RustTestNetworkView.cs` out of the load directory to prevent reloading on restart. Other plugins and the game server need not be removed/restarted.

This feature tests how a management view displays simulated values. It does not make an existing administrator plugin show random real addresses and cannot validate or alter Facepunch's player-acceptance rules.

## Offline validation

The source compiled against available local Oxide/Rust references. Same-source isolated checks covered permissions, parameters, capacity, random range/uniqueness, unchanged real connections, renewal, connection replacement, expiry, disconnection, and unload cleanup. It was not loaded on the target server; those checks do not replace a target compatibility check.

From the repository root, using Windows' .NET Framework compiler:

```powershell
./tools/rust-research/Build-RustTestNetworkView.ps1 -ReferenceDirectory <matching-reference-directory>
./tools/rust-research/Test-RustTestNetworkView.ps1
```

References must include Oxide.Core.dll, Oxide.CSharp.dll, Oxide.Rust.dll, Facepunch.Console.dll, and Facepunch.Network.dll. Generated files default to ignored `work/`; the server deliverable remains the `.cs` source. The summary is `rust-research/network-view-simulation-2026-10-26.json`.
