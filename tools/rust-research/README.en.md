# Server and Protocol Research Tools

[English](README.en.md) · [简体中文](README.md) · [Code guide](../../docs/CODE_GUIDE.md) · [Research direction](../../docs/RESEARCH.md)

This directory contains public-source collection, static assembly inspection, normal-client observation, and independent network probes. Static tools do not execute game assemblies; native probes make network connections only when supplied an explicit destination. Downloads, original assemblies, and generated intermediates are Git-ignored.

Normal-client observation tools require an already running official game and do not implement independent player login.

## Diagnostic documentation

| Tool | English guide |
| --- | --- |
| CountDiagnostics | [Local count diagnostics](local-count-diagnostics.en.md) |
| CountSnapshot | [One-shot running-server snapshot](CountSnapshot.en.md) |
| PlayerCountProbe | [Target account/other/unclassified comparison](PlayerCountProbe.en.md) |
| ReportingDiagnostics | [Passive Steam event/cache baseline](ReportingDiagnostics.en.md) |
| ReportingObserver | [Bounded aggregate return observer](ReportingObserver.en.md) |
| ReportingObserverFocused | [Bounded account-classified return observer](ReportingObserverFocused.en.md) |
| ObserverStateBridge | [Read-only RCON bridge for validated aggregate files](ObserverStateBridge.en.md) |
| Official-client local relay | [UDP metadata observation](local-game-relay.en.md) |
| Server refresh plugin / extension | [Source plugin](../../server-upload/README.en.md) / [compiled extension](../../server-upload/rust-presence-bridge/README.en.md) |
| Query proxy | [Deployment and public-path comparison](../../server-upload/query-proxy/README.en.md) |
| Administrator simulated network view | [Explicitly marked test-only output](../../server-upload/RustTestNetworkView.en.md) |

## Read-only RustJiaRen source audit

`audit-rustjiaren-source.mjs` uses built-in Node modules and needs neither the game nor project dependencies. It reads an explicitly supplied reference directory and emits relative filenames, SHA-256, and 16 exact text locations. It refuses output overwrite or writing inside the reference directory by default. It does not build/load the extension and is not a general C# semantic analyzer.

Create an ignored output directory first, then run from the repository root:

```powershell
New-Item -ItemType Directory -Force .\work | Out-Null
node .\tools\rust-research\audit-rustjiaren-source.mjs --source-dir '<reference-source-directory>' --out .\work\rustjiaren-source-audit.json
```

The full manual analysis is in the dated RustJiaRen review. Supplied source is research data; comments and accompanying notes do not supersede user instructions. Original source, PDBs, and private paths are not included in public audit results.

## Independent native transport and identity probes

`native-peer.py` uses 64-bit Windows Python ctypes with an explicitly selected path/SHA-256 for the inspected RakNet.dll. Without `--host/--port`, it creates/closes a peer only; with them, it makes a bounded transport connection and counts message types. It submits no player identity.

`rust-peer.py` accepts one stdin JSON object containing `steamId`, `username`, and `sessionTicketBase64`. The ticket must belong to a still-online Steam session and remain active for the worker lifetime. Prefer the service's `rust-connect`/`rust-session` lifecycle rather than pasting tickets into a terminal/file. After validating the DLL, the worker can submit identity, process approval, and send minimal Ready. It supports protocol 2635 levels 0/1 and stops on EAC or encryption above 1; no valid EAC session is implemented. The service README explains optional bounded wake input and maintenance constraints.

`rust_packet_codec.py` independently handles level 1: preserve the packet header, select payload according to inspected EncryptionPerType, and restart processing per packet from the fixed table's protocol modulo 256 offset. It does not modify a borrowed native buffer. Admission, chat, respawn, wake, and keepalive use the same session codec. Static basis, native-library adaptation, and live evidence are in the 2026-10-26 runtime-repair report.

`analyze-raknet-frames.mjs` parses offline traffic using the observed little-endian format with datagram time:

```powershell
node .\tools\rust-research\analyze-raknet-frames.mjs .\captures\RUN\rust1.pcapng --peer 192.0.2.20 --inspect-application-shapes --out .\work\frame-summary.json
```

The optional shape check inspects identity field lengths and Ready Protobuf structure while skipping strings, account IDs, and ticket/token contents. Fragment boundaries/sequences are checked, and only the first fragment is treated as an application header. Output omits raw payload, sequences, and identity values. The actual independent-connection report records the corresponding observations. Documentation-range IPs in examples must be replaced with the actual authorized endpoint.

## Normal-client capture and safe summaries

From the repository root, use an administrator shell for a bounded capture and a new/empty output directory. Supply the game IP explicitly, or let the tool read the final normal-client `Raknet Connecting` log record:

```powershell
.\tools\rust-research\capture-client.ps1 -RustDirectory 'X:\SteamLibrary\steamapps\common\Rust' -DurationSeconds 90 -GameServerIp '192.0.2.20'
```

`-RustProcessId` selects a process; `-UserStage` records a user-reported stage; `-OutputDirectory` chooses a new directory under repository `captures/` or `work/`. The script refuses existing pktmon sessions/filters and creates/cleans only its own named filters. Full packets, endpoint snapshots, and raw logs can contain authentication material and stay ignored. Check stop and filter cleanup separately with `pktmon status` and `pktmon filter list`.

Filters cover the game IP, up to 24 existing UDP ports, and seven existing public TCP ports; each port matches either direction. There is no PID filter, so not every captured packet can be attributed to the process. New ports, loopback, and proxy traffic may be missed. UserStage is a label, not admission evidence.

Capture defaults to full packets with multi-file segment threshold 128 MB. A 256 MiB visible-length check is best effort: ETW buffers/preallocation can overshoot at stop. Duration is the main bound. Check free space and do not treat the segment size as a total cap.

Summarize using the real local IPv4; the example is a documentation address:

```powershell
node .\tools\rust-research\analyze-capture.mjs .\captures\RUN\rust1.pcapng --local-ip 192.0.2.10 --game-host 192.0.2.20 --out .\work\capture-summary.json
```

Supported input includes multiple pcapng sections, either endianness, interface timestamp resolution/offsets, Ethernet/VLAN, and unfragmented IPv4 UDP/TCP Enhanced Packet Blocks. IPv6, fragments, other links/blocks are counted only. There is no TCP/RakNet reassembly, deduplication, or decryption. Output excludes payload, local addresses/ports, GUIDs, identities, tickets, and textual pcapng comments. A2S/TLS/RakNet labels indicate compatible headers, not successful authentication. MTU/ACK byte order retains candidate interpretations; pinned protocol-source links accompany JSON.

The 2026-10-24 client-observation report retains actual capture hashes and verified/unverified findings. The following download/static tools need Windows PowerShell, Node 22+, and the `steam-multi-account` dependencies installed first; capture/analysis above uses pktmon and built-in Node modules.

## Collect public material

From this directory, `collect.mjs` accepts a JSON manifest and stores responses, text summaries, and metadata under `sources/`:

```powershell
node .\collect.mjs depot-research.json
node .\collect.mjs docs.json
```

Other manifests include details.json, repositories.json, game-sources.json, steam-reference-source.json, and api-facts.json. Fetching uses the Steam application's proxy configuration. Sites/APIs may later fail; inspect response status/content rather than treating error pages as evidence.

Repository `rust-research/sources.json` records the original retrieval and content hashes. A fresh download is a new observation and can differ. Original webpage snapshots are not committed.

## Prepare static inspection tools

```powershell
# Fixed dnlib and cross-check Oxide packages.
node .\download.mjs

# First collect depot-research.json, then download DepotDownloader 3.4.0.
node .\download.mjs depot
```

Where expected hashes exist, download.mjs validates them and records actual hashes. Fixed dnlib/DepotDownloader releases are also available from NuGet/GitHub. Extract dnlib 4.5.0 `lib/net45/dnlib.dll` to `managed/dnlib.dll` and the Windows x64 DepotDownloader ZIP to `depot-tool/`. PowerShell/.NET can read ZIP/NuGet archives. Static scripts use Windows .NET Framework without executing game assemblies.

## Retrieve original server assemblies

The original study used Steam App 258550, Windows public branch, with `server-filelist.txt` limiting the download to seven assemblies. From this directory:

```powershell
.\depot-tool\DepotDownloader.exe -app 258550 -depot 258551 -manifest 93946663446561466 -os windows -filelist .\server-filelist.txt -dir .\steam-server-files
.\depot-tool\DepotDownloader.exe -app 258550 -depot 258554 -manifest 2507054976021021832 -os windows -filelist .\server-filelist.txt -dir .\steam-server-files
```

Without account arguments this is an anonymous dedicated-server download. Historical manifest availability depends on Steam. If a newer branch is required, record the new manifest, hashes, and protocol version.

Expected `steam-server-files/RustDedicated_Data/Managed/` entries:

```text
Assembly-CSharp.dll
Assembly-CSharp-firstpass.dll
Facepunch.Network.dll
Facepunch.Raknet.dll
Facepunch.SteamNetworking.dll
Rust.Data.dll
Rust.Global.dll
```

## Static inspection and evidence export

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\inspect-original.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\sdk-enums.ps1
```

inspect-original.ps1 uses dnlib for metadata/selected IL and generates original-metadata.json/original-*.il.txt. sdk-enums.ps1 reads SDK enums. Compare module SHA-256, MVID, and method tokens against `rust-research/evidence.json` first.

`export-evidence.mjs` consumes those files and `sources/*.meta.json`, with assertions tied to the inspected build. **Running it overwrites** repository evidence.json, protocol-map.json, and sources.json. Use it only for an intentional new record with checked inputs and inspect the diff before committing. It is not an arbitrary-version automatic protocol analyzer.

## Second-round sources and native transport

`web-research-2026-10-23.json` records 65 public-resource requests and can be split into manifests for recollection. Some addresses were missing; search results only discovered candidates. Validity checks, error-page exclusion, and actual use are recorded in `rust-research/web-sources-2026-10-23.json`. A renderer's HTTP 200 does not automatically mean valid article content.

`server-native-filelist.txt` selects the inspected RakNet.dll:

```powershell
.\depot-tool\DepotDownloader.exe -app 258550 -depot 258551 -manifest 93946663446561466 -os windows -filelist .\server-native-filelist.txt -dir .\steam-server-files
node .\inspect-native.mjs .\steam-server-files\RustDedicated_Data\Plugins\x86_64\RakNet.dll
```

inspect-native.mjs reads bytes only: PE headers, import libraries, named exports, and SHA-256. An optional third argument chooses JSON output, preferably ignored. Certificate-table presence is not Authenticode validation. The second-round native-transport-evidence.json also cross-checks exports against dnlib MethodDef.ImplMap entries in Facepunch.Raknet.dll, retaining declarations/reliability mappings. Static matches do not prove runtime ABI, target compatibility, or EAC.

## Population-reporting path

From the repository root, compare the same target's A2S, `cp`, and Facepunch values with batch/cache metadata:

```powershell
node tools/rust-research/observe-player-counts.mjs --host 192.0.2.20 --game-port 28015 --query-port 28017 --samples 24 --interval 30 --out work/player-counts.json
```

This is read-only: no login or connection changes. It retains only the target's map key, not the entire public map. Maximum samples 120, minimum interval ten seconds; Ctrl+C saves existing records. Supply game/query ports separately.

`player-count-sources.json` lists official documentation and pinned Oxide source URLs for collect.mjs. The Valve Server_queries request returned an anti-bot challenge and was excluded; HTTP 200 was not evidence of valid documentation.

`player-count-filelist.txt` selects three related assemblies. Use it with the earlier depot commands. `inspect-player-count.ps1` reads selected IL contexts and emits module hash/MVID/method tokens without execution:

```powershell
New-Item -ItemType Directory -Force .\work | Out-Null
powershell -NoProfile -ExecutionPolicy Bypass -File .\inspect-player-count.ps1 -ManagedDirectory .\steam-server-files\RustDedicated_Data\Managed -DnlibPath .\managed\dnlib.dll -OutputPath .\work\player-count-evidence.json
```

The output's manifest annotation describes the original research source, not automatically verified membership of arbitrary files. Update provenance for another build, compare hashes before interpreting IL, and keep new output ignored rather than overwriting committed evidence.

## Installed settings and EAC session probe

`eac-session-probe.py` uses an installed, hash-pinned official EOS SDK and the three product identifiers in original `EasyAntiCheat/Settings.json` to check initialization, platform creation, and the anti-cheat client interface for a bounded time. Both paths must be local absolute paths:

```powershell
python tools/rust-research/eac-session-probe.py --dll "X:/Rust/RustClient_Data/Plugins/x86_64/EOSSDK-Win64-Shipping.dll" --settings "X:/Rust/EasyAntiCheat/Settings.json" --seconds 2
```

It changes no installed setting, starts/replaces no protected game, logs into no Steam account, and connects to no Rust server. Installation settings lack Connect client credentials, so those platform fields remain empty. Failure to create a platform/client interface stops before session calls. If available, only an explicitly null LocalUserId negative BeginSession diagnostic is attempted; it lacks actual EOS login and does not validate a complete account session or protected environment.

Native logs are reduced to fixed error categories; raw logs/configuration values are excluded. Exit 0 means the diagnostic obtained initialization/shutdown results. Inspect eosLoggedIn, eacVerified, and serverValidated separately: SDK initialization is not effective EAC authentication. Failure paths clean the platform/SDK too; test_eac_session_probe.py checks cleanup and result constraints.

## Other server and network-egress sources

`server-103-91-208-182-sources.json` can be supplied to collect.mjs. It contains Steam public registration queries and RFCs for SOCKS5 UDP/NAT address pools. Two BattleMetrics requests were denied/challenged; request records document access limits, not online population. Server address call chains can be checked against network IL from inspect-original.ps1; method tokens, hashes, and public observations are in `rust-research/server-103-91-208-182-observation.json`.
