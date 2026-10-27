# Normal Rust client observation:2026-10-24

Historical report; all times Beijing time (UTC+08:00). Structured evidence: [client-observation-2026-10-24.json](client-observation-2026-10-24.json).

## Results obtained in this round

The local Steam-management service was started and the user's normally running Rust client was observed for the first time: an existing-session baseline and a capture including two reconnections. Both RakNet offline handshakes contained complete Request 1→Reply 1→Request 2→Reply 2 sequences, with version byte **6**. This filled the earlier gap of not having observed a real client transport handshake.

**At this stage, an independent Rust player client was not yet implemented, and no valid independent Rust-product EAC session was requested, generated, or verified.** Official-process behavior does not mean the independent client was ready. Later dated connection reports record subsequent work.

## Client and actual server

|Item|Observation|
|---|---|
|User-supplied installation|`E:\SteamLibrary\steamapps\common\Rust`|
|Actual process|RustClient.exe; protected process did not return its executable path|
|Log version|Protocol 2635.289.1, changeset 168909|
|Steam manifest build ID|26140533; distinct from changeset and RakNet version|
|Unity version|6000.3.15x1-13(a91cf34396ee)|
|Compilation|IL2CPP; GameAssembly.dll and global-metadata.dat|
|Metadata header|Magic 0xfab11baf, version 39, 68,271,512 bytes; old layouts were not assumed compatible|
|Game endpoint|61.147.247.35:28015, checked against log and handshake|
|Query endpoint|61.147.247.35:28016, discovered in Steam registration and checked by A2S|
|Published server version|2635, build 168909, ptrak tag|

This is a different target from earlier 202.189.21.138 and 103.91.208.182; those were not revalidated here. Registered secure and A2S vacSecure were both false, which alone proves neither enabled nor disabled EAC. Admission results cannot be transferred to the previous targets.

## Capture scope and integrity

|Segment|Capture time|pcapng packets|Purpose|
|---|---|---:|---|
|Existing-session baseline|01:18:23–01:19:55|24,686|User reported being in-world; observe ongoing traffic|
|Normal reconnects|01:21:23–01:26:25|83,054|Two connections, handshakes, and loading stages|

The two primary pcaps contained 107,740 packets. pktmon conversion counts agreed with the independent analyzer; no truncation, malformed frame, or unknown interface was found. pktmon reported no lost events and conversion 0 dropped packets. This does not prove no network packet loss. One Ethernet interface was captured; records were not deduplicated or used to diagnose retransmission.

Administrator pktmon captured NIC-layer packets with explicit `--pkt-size 0`. Filters selected the game-server IP and existing Rust UDP/TCP ports. pktmon has no PID filter: new sockets, loopback, subsequent proxy connections, and unselected ports may be absent. **This was not a complete process-network trace and did not automatically reveal encrypted plaintext.**

Raw ETL, pcapng, client logs, and local port snapshots stayed in ignored captures/ and work/ because they can contain authentication data. Published JSON contains sanitized metadata, necessary public endpoints, and hashes.

## Handshake and endianness evidence

The log recorded Connecting at **01:23:08.382** and **01:24:56.578**, corresponding to the two offline handshakes. Spawning World followed at 01:23:24.891 and 01:25:11.571, then Finalizing/Cleaning Up. Loading messages alone prove neither actionable world entry nor EAC validation.

|Field|Common observation in both sequences|
|---|---|
|Request 1|Exact offline RakNet magic; protocol byte 6|
|Request 1 length|UDP payload 1372 bytes; IPv4 packet 1400 bytes|
|MTU location in Reply 1/Request 2/Reply 2|Same bytes read BE30725 or LE1400|
|Reply 1/Reply 2 security flag|0; transport-handshake field, not EAC status|

LE1400 matches Request 1's IPv4 length and warrants further review. Both interpretations were retained; upstream default-BE compatibility was not claimed and no unverified compiler option was blamed. ACK/NAK statistics likewise retain layout-compatibility qualifications. UDP's first byte was not interpreted as a Rust application message.

Reliable RakNet messages, fragmentation, and Rust application payloads had not yet been decoded/reassembled, nor TLS/EAC data decrypted. Actual transport byte order and reliable-message layout were the next priorities before application messages and encryption boundaries.

## Existing-session baseline

Actual packet span 90.911218 seconds. Game-port inbound 12,775 packets, outbound 11,872, approximately 140.5 and 130.6 packets/sec; raw frame bytes 1,298,767 inbound and 660,534 outbound. Median inbound frame 93 bytes, outbound 53 bytes.

Outer UDP first bytes included 0x80/0x84/0x88/0xc0. These include transport data/acknowledgments and cannot directly establish PlayerTick frequency or an EAC heartbeat. A small amount of 443/TCP traffic had TLS-header features; TCP was not reassembled, services identified, or plaintext read.

## Different count fields

The separate Node A2S query tool returned:

|Beijing time|A2S players|cp|maxPlayers|bots|
|---|---:|---:|---:|---:|
|01:20:00.676|14|12|200|0|
|01:20:55.351|14|12|200|0|
|01:21:25.440|12|10|200|0|
|01:21:55.546|12|10|200|0|

The query packets are not player-connection evidence. players exceeded cp by 2 in all four responses, both changing over time, showing these external fields are not interchangeable. No server activePlayerList, administrator status, plugin implementation, or freshly displayed browser count was obtained, so neither the difference's source nor a particular account/program could be identified.

## Native-component static review

Client RakNet.dll was x64, 312,656 bytes, with 36 named exports matching prior server evidence; all 29 imports from the old managed wrapper had name matches. Client SHA256 `5bd99d127e7453bf04793681bf8e6e25db8abebe16f9f15583da34807ed1aa44`; old server `a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21`. Different files and matching names do not prove ABI, configuration, or runtime compatibility.

Client EOSSDK had 680 named exports, including EOS_AntiCheatClient_BeginSession, ReceiveMessageFromServer, ProtectMessage, UnprotectMessage, and EOS_Connect_Login. Existence/export declarations do not establish actual calls or verification in these connections. Components were only read statically, not loaded/executed.

## Tools and continuation

- `tools/rust-research/capture-client.ps1`: bounded endpoint-filtered pktmon capture; rejects existing capture/filters and nonempty output; guards stopping and filter cleanup separately.
- `analyze-capture.mjs`: offline pcapng metadata/handshake analysis, without payloads, local addresses, GUIDs, identities, or tickets. Protocol-source locations are in JSON.
- Multi-file `--file-size` is a segment threshold. ETW buffering/preallocation means visible length is not a hard total-capacity limit; bound time and check disk space.
- Two additional real 10-second tool runs covered normal operation and simulated startup-log-write failure; both confirmed successful stop and filter cleanup. Service /health returned `{"ok":true}` at 127.0.0.1:3210.

Unresolved at this stage: transport byte order/reliable reassembly, actual application messages/deltas, encryption boundaries, official EOS/EAC session requirements, and simultaneous server/browser count comparisons. The evidence narrowed those questions without completing them.
