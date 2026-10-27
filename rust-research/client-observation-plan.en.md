# Plan for observing a normal Rust client connection

Historical preparation plan for a Windows computer with the game installed. At preparation time it had not run there. Intended game endpoint:`202.189.21.138:28015`; A2S:`202.189.21.138:28017`.

**Execution update, 2026-10-24:** session-baseline and normal-reconnect captures were subsequently completed on a Rust-equipped computer, against a different target. See [the observation report](client-observation-2026-10-24.en.md). The original plan remains below. `tools/rust-research/capture-client.ps1` provides bounded capture and `analyze-capture.mjs` sanitized summaries; tool README documents parameters/scope. Actually check pktmon status and filters after capture.

## Before starting

Record Windows version, Rust directory/build, client/network-component SHA256 hashes, actual launch method, and network adapter. Check existing pktmon, Wireshark/dumpcap/tshark, Npcap, and permissions. Wireshark may be installed under `C:\Program Files\Wireshark` without being on PATH.

Keep normal Steam/EAC launch and current networking. Preserve ordinary graphics/logging for the first complete connection baseline. Rust compatibility with generic Unity `-batchmode`/`-nographics` was unverified; some options also affect logging.

Create a local directory from the repository root:

```powershell
$captureDirectory = Join-Path (Get-Location) ('captures\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $captureDirectory -Force | Out-Null
```

captures/ is ignored. Raw logs, captures, and complete command lines can contain identity/authentication material; only sanitized material belongs in Git.

## Option A: dumpcap when Wireshark/Npcap is available

Run dumpcap -D and select the adapter actually carrying target traffic. Set paths/interface number for the local computer:

```powershell
$dumpcapPath = Join-Path $env:ProgramFiles 'Wireshark\dumpcap.exe'
& $dumpcapPath -D
$captureInterface = 1 # Replace with the verified interface number.

& $dumpcapPath -i $captureInterface -p -s 0 `
  -f 'udp and host 202.189.21.138 and (port 28015 or port 28017)' `
  -a duration:900 -a filesize:250000 `
  -w (Join-Path $captureDirectory 'rust.pcapng')
```

Capture in a separate terminal before starting the client. It ends after 15 minutes or approximately 250 MB, whichever comes first; Ctrl+C ends it earlier. It preserves the beginning. If size stops it, record that time and start another segment if needed.

This filter captures target game/query UDP traffic, not other Steam/EOS addresses/ports or local IPC. Determine additional scope separately from actual processes/endpoints.

## Option B: system pktmon

First inspect pktmon status, filter list, and local help. Existing filters combine with new filters by OR; do not clear another task's filters. If capture already exists, prefer an independent dumpcap capture.

In a terminal with pktmon permissions:

```powershell
pktmon filter add RustGameResearch -i 202.189.21.138 -t UDP -p 28015
pktmon filter add RustQueryResearch -i 202.189.21.138 -t UDP -p 28017
pktmon start --capture --comp nics --pkt-size 0 --log-mode multi-file `
  --file-size 128 --file-name (Join-Path $captureDirectory 'rust.etl')
```

**--pkt-size 0 saves complete packets; the default captures only 128 bytes.** Multi-file creates subsequent segments, retaining the initial handshake. Monitor disk space and stop explicitly after observation. Resolve permissions/arguments if startup fails, and verify capture is running before starting the game.

```powershell
pktmon stop
pktmon filter remove RustGameResearch
pktmon filter remove RustQueryResearch
```

Keep original ETLs and convert each actual generated file:

```powershell
pktmon etl2pcap (Join-Path $captureDirectory 'rust.etl') `
  --out (Join-Path $captureDirectory 'rust.pcapng')
```

Multi-file filenames may contain sequence numbers; use actual directory entries. Conversion loses some Windows-component/loss information. If the same packet appears at multiple components, use pktmon list, the original ETL, and --component-id to check. Do not count component duplicates as network retransmissions.

## Timestamp every stage

Start capture before launch and record events in another terminal using timezone-bearing strings:

```powershell
('client-start ' + (Get-Date -Format o)) | Add-Content -LiteralPath (Join-Path $captureDirectory 'timeline.txt') -Encoding UTF8
```

Also mark connect-click, queue, loading, entered-world, idle-start, idle-end, and disconnect as they actually occur. Packet activity alone is not entry into the game.

Suggested sequence: launch→menu→connection→queue/load→world entry→stationary presence for at least 10 minutes→normal disconnect. If capture ends before entry, record that and capture a later stable-presence segment. The first round should capture a complete normal lifecycle.

Verify Rust's actual log path. Unity's general Windows template is `%USERPROFILE%\AppData\LocalLow\CompanyName\ProductName\Player.log`; Rust may override it. Do not treat that generic template as a verified Rust path. Inspect generated files/timestamps after the installation directory is supplied.

## Associate process, ports, and packets

Record the actual Rust PID. Get-NetUDPEndpoint can select local UDP ports by OwningProcess, but is not a complete UDP remote-session table. Correlate local ports, target endpoints, and stage times in the capture; port numbers alone do not identify EAC traffic.

Background query tools may also contact 28017. Mark simultaneous A2S queries separately; they are not player connections.

Wireshark has a raknet dissector. Check its version/available fields and whether it identifies complete handshakes. Preserve raw data if decoding fails and distinguish missing capture, version differences, encryption, and dissector limitations. Do not force arbitrary UDP into Rust application message numbers.

Export metadata without payloads:

```powershell
$tsharkPath = Join-Path $env:ProgramFiles 'Wireshark\tshark.exe'
& $tsharkPath -r (Join-Path $captureDirectory 'rust.pcapng') `
  -Y 'ip.addr == 202.189.21.138 && udp.port == 28015' `
  -T fields -E header=y -E separator=, `
  -e frame.time_epoch -e ip.src -e udp.srcport -e ip.dst -e udp.dstport -e udp.length |
  Set-Content -LiteralPath (Join-Path $captureDirectory 'game-metadata.csv') -Encoding UTF8
```

## Questions and evidence boundaries

|Question|Collectable evidence|Insufficient inference|
|---|---|---|
|Actual handshake/version|Complete capture beginning before connection, native component information, dissector results|Application protocol 2635 equals RakNet transport version|
|Readable application messages|Correctly reassembled payloads and identified encryption boundaries|UDP's first byte can be decoded directly with application offset 140|
|Ongoing idle traffic|Per-stage frequency, direction, length, logs, and parsed fields|Similar periodic packets are a fixed EAC heartbeat|
|Disconnect stage|Client message, logs, and packet timeline|Several minutes of traffic proves anti-cheat completion|
|Successful stable entry|Real player in-world and sustained state, plus available server evidence|A2S count changes or Steam game activity alone prove entry|

Client-only observations must identify authentication states lacking server evidence. Encrypted traffic, static exports, and ongoing communication individually do not establish an independently implemented valid EAC session.

## Verified tool references

- [Microsoft: pktmon start](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-start)
- [Microsoft: pktmon filter add](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-filter-add)
- [Microsoft: pktmon etl 2pcap](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-etl2pcap)
- [Wireshark: dumpcap](https://www.wireshark.org/docs/man-pages/dumpcap.html)
- [Wireshark: tshark](https://www.wireshark.org/docs/man-pages/tshark.html)
- [Wireshark: RakNet fields](https://www.wireshark.org/docs/dfref/r/raknet.html)
- [Unity: log files](https://docs.unity3d.com/Manual/log-files.html)
- [Unity: Player command-line arguments](https://docs.unity3d.com/Manual/PlayerCommandLineArguments.html)
