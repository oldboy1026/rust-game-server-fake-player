# Second round of public-reference and native-transport research

Date: 2026-10-23, Asia/Shanghai.

The most useful new result was **obtaining the original `RakNet.dll` from the same Steam manifest as the initial research, then confirming statically that it exposes client transport entry points and contains matching export names for all 29 native imports in the current managed wrapper.** This introduces another implementation path worth validating: evaluate reuse of the native transport library while continuing to study the Rust application layer and EOS/EAC sessions.

This round also reviewed a Node.js RakNet binding with a configurable transport version, Wireshark's RakNet dissector, and official Windows packet-capture and EOS message-lifecycle documentation. It added 65 public-source retrieval records: 46 supported the findings, 6 were excluded as missing or error pages, and the rest were search discoveries or backup material. Complete URLs, timestamps, SHA-256 hashes, and usage status are in [web-sources-2026-10-23.json](web-sources-2026-10-23.json).

**No Rust client was started, newly downloaded DLL was invoked, player connection was established, or valid EAC session was generated.** The sections below distinguish observed facts from questions that still require validation.

## 1. Native RakNet library: new direct evidence

SteamRE DepotDownloader 3.4.0 and an anonymous dedicated-server subscription retrieved:

| Item | Observed value |
| --- | --- |
| Steam App / Depot | 258550 / 258551 |
| Manifest | 93946663446561466, the same source manifest as the first-round assemblies |
| File | `RustDedicated_Data/Plugins/x86_64/RakNet.dll` |
| Size | 312,656 bytes; compressed download 164,576 bytes |
| SHA-256 | `a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21` |
| PE format | x64, PE32+ |
| Static import libraries | `WS2_32.dll`, `KERNEL32.dll` |
| Named exports | 36 |
| Comparison with managed declarations | Matching names found for all 29 native imports from `Facepunch.Raknet.dll` |

Important exports include `NET_Create`, `NET_StartClient`, `NET_StartServer`, `NET_Receive`, `NETRCV_RawData`, `NETSND_Start`, `NETSND_WriteBytes`, `NETSND_Send`, and `NET_CloseConnection`. The managed declarations name the library `RakNet` and mark P/Invoke with `CallConvWinapi`. Complete signatures, method tokens, file provenance, and limitations are in [native-transport-evidence.json](native-transport-evidence.json).

Static observation supports the statement that the dedicated server's native library also contains client interfaces. It does not establish that those interfaces can complete a connection from an independent host, or that this file matches the user's installed client, the target server binaries, or their runtime configuration. After matching names, parameter widths, structure layouts, Boolean marshaling, buffer ownership, lifecycle, and loading dependencies must still be checked. A PE certificate table does not establish a valid signature, much less eligibility for an EAC session.

This path could reduce the work of reimplementing the outer RakNet transport. Rust player state, Steam/EOS identity, and anti-cheat messaging still need separate implementation. The repository contains only static findings, a file allowlist, and [inspect-native.mjs](../tools/rust-research/inspect-native.mjs); the original DLL remains local.

### Further confirmation of send reliability

The current IL of `Peer::ToRaknetPacketReliability` corresponds to the public RakNet `PacketPriority.h` enum as follows:

| Rust SendMethod | Rust value | Native transport value | Public RakNet name |
| --- | --- | --- | --- |
| Reliable | 0 | 3 | RELIABLE_ORDERED |
| ReliableUnordered | 1 | 2 | RELIABLE |
| Unreliable | 2 | 0 | UNRELIABLE |

A future send wrapper should preserve these reliability differences. Method tokens and IL text hashes are stored in the new native evidence file; the [public enum source](https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/PacketPriority.h) supplies the names. This table alone does not determine the actual channel or send method for each Rust message type.

## 2. Candidate projects and their scope

| Candidate | Reviewed material | Help and limitations for this project |
| --- | --- | --- |
| [extremeheat/node-raknet-native](https://github.com/extremeheat/node-raknet-native/tree/d66fe85a36a63633e6382fd089bf3f0d7a49e024) | Native Node.js binding; package version 1.2.3 at the fixed source; declared ISC license; generic Client/Server; configurable `protocolVersion` | A Node.js transport candidate worth validating. It was not installed, compiled, or validated against Node 22 and current Rust. |
| [Asbra/RustInterceptor](https://github.com/Asbra/RustInterceptor/tree/4bc4d8ac2879e268342c1c4185d5998ecb4b9303) | Rust client/server proxy and packet parser dated 2016-12-01; depends on the game's contemporary Rust.Data.dll, UnityEngine.dll, and RakNet.dll; MIT | Useful historical wrappers and parsers. It still requires an actual client, and predates the current protocol and EOS path. |
| [b23r0/rust-raknet](https://github.com/b23r0/rust-raknet/tree/7599b2498c8cc1aa6f141ee00ca4aad3ba5f6e6c) | Async reliable UDP/RakNet library in the Rust programming language; inspected Cargo version 1.4.0 | A transport candidate. Its name does not mean it supports Facepunch Rust player authentication. |
| [PrismarineJS/bedrock-protocol](https://github.com/PrismarineJS/bedrock-protocol/tree/c9e1fbf21dc6abde8d89920996575791b79e66cf) | Explicitly targets Minecraft Bedrock, with its own serialization, Xbox identity, and encryption | Useful as a layering reference. Its game messages and identity flow cannot be applied to Rust on that basis. |
| [facebookarchive/RakNet](https://github.com/facebookarchive/RakNet/tree/1a169895a900c9fc4841c556e16514182b75faf8) | Original public implementation, source version 4.081, public transport protocol constant 6 | A verifiable basis for handshake, reliability, fragmentation, and retransmission. Native changes used by current Rust still need comparison. |

The `raknet-native` source passes `protocolVersion` to `SetProtocolVersion`. Its gitlink fixes `extremeheat/fb-raknet` to `424ae0fcb5902171c10b5aa4fcc48c45dc984633`. That fork's default protocol constant is also **6**, while the README's Minecraft example explicitly uses **10**. These numbers belong to RakNet's transport layer. **The actual value used by the target Rust build had not been observed.** Rust application protocol **2635** and identity-message marker **228**, found in the first round, are different fields and must not be used interchangeably as the transport version.

Another implementation detail needs care: at the fixed commit, `lib/RakNet.js` emits the `encapsulated` event with an object shaped as `{ buffer, address, guid }`; some README examples treat the argument as a Buffer. Future integration should follow the inspected source.

Related source: [native Client implementation](https://github.com/extremeheat/node-raknet-native/blob/d66fe85a36a63633e6382fd089bf3f0d7a49e024/src/RakClient.cpp), [JS wrapper](https://github.com/extremeheat/node-raknet-native/blob/d66fe85a36a63633e6382fd089bf3f0d7a49e024/lib/RakNet.js), and [fixed submodule interface](https://github.com/extremeheat/fb-raknet/blob/424ae0fcb5902171c10b5aa4fcc48c45dc984633/Source/RakPeerInterface.h).

## 3. Wireshark already has a RakNet dissector

The [official Wireshark field reference](https://www.wireshark.org/docs/dfref/r/raknet.html) lists RakNet protocol, reliability, ordering, ACK/NAK, and fragmentation fields. The reviewed [packet-raknet.c](https://github.com/wireshark/wireshark/blob/fe168fe75ceda882ef00271041ee8e53d7ab5dad/epan/dissectors/packet-raknet.c) has UDP heuristic detection and per-session parsing state.

This can help identify transport structures in normal-client captures and reduce parser work. Capture should begin before connection startup because heuristic detection and session state depend on the early handshake. Recognizing the outer RakNet transport does not mean that the dissector understands current Rust application messages.

For RakNet encrypted sessions that it recognizes, the source displays “Encrypted message” and says the relevant decryption is unsupported. RakNet session encryption must still be distinguished from Rust/EOS application-message protection. This round did not determine which encryption layers the target enabled. A Wireshark label does not establish a particular target encryption configuration.

## 4. Concrete packet-capture preparation improvements

Using the official [pktmon start](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-start), [filter](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-filter-add), [conversion](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-etl2pcap), and [dumpcap](https://www.wireshark.org/docs/man-pages/dumpcap.html) references, this round prepared the [client observation plan](client-observation-plan.en.md).

- pktmon saves only **128 bytes** per packet by default. Protocol observation should explicitly use `--pkt-size 0` to retain complete packets.
- Multiple pktmon filters are combined as “match at least one.” Conditions within one filter must all match. Putting two ports in one filter does not mean “match either port.”
- pktmon's default circular log can overwrite the earliest events. A handshake observation needs to preserve the beginning; the plan uses a mode that retains earlier files and includes an explicit stop.
- One packet may be observed at several Windows network-stack components. Preserve the ETL and compare components during conversion, so duplicate component records are not mistaken for actual network retransmissions.
- `dumpcap -s 0` uses a sufficiently large snapshot length for complete packets. The plan includes a bounded-capture template filtered to the target address and game/query ports.
- Official Unity documentation gives the Player-log location and `-logFile` option, but the actual Rust path must be checked locally. Preserve normal startup conditions for the first observation; a generic Unity argument does not establish that Rust behaves identically.

These are verified tool behaviors and preparation steps. No capture was run on the user's new computer in this round.

## 5. Additional EOS/EAC facts

The newly reviewed official API references add three constraints:

1. [AddNotifyMessageToServer](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-add-notify-message-to-server) states that callbacks occur only between a successful BeginSession and its corresponding EndSession in ClientServer mode. They are issued on the thread calling `EOS_Platform_Tick`. The data is opaque binary that should be passed to the official server receive interface. Registering a callback does not establish that valid session data has been produced.
2. [BeginSession](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session) states that when leaving one game session and connecting to another, the old session must end before the new one begins. Disconnect/reconnect research must therefore track the session lifecycle rather than only one login message.
3. [ProtectMessage](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-protect-message) explicitly defines NetProtect as optional game-message encryption. API availability, completed authentication, and whether the target actually protects a particular message all need separate evidence.

Official integration documentation also confirms that anti-cheat messages travel over the game's own network layer and that processing session data continues around authentication completion. This matches the EAC dispatch path in the original server code. It still does not reveal a way to fabricate valid Rust anti-cheat proof in an independent program.

## 6. Results explicitly excluded

Public searches returned many similarly named or differently scoped projects, including Rust programming-language libraries, Minecraft/SA-MP bots, Rust+ companion clients, and promotions with no verifiable implementation. GitHub searches read only a limited number of result pages; this does not establish that no public or private implementation exists.

Three attempted Facepunch client-command pages and two guessed GitHub repository URLs returned 404 and were not used as factual support. An Epic FAQ fetched through a text renderer returned HTTP 200, but its body explicitly reported the target as 404; it was also excluded. For other dynamic Epic documentation, the records retain the actual retrieval URL and hash and identify the use of third-party text rendering.

## 7. Priorities for the next practical step

1. On a computer with Rust installed, record the real client version, relevant file hashes, native exports, and log paths, then compare them with the server library reviewed here.
2. Follow the observation plan to obtain one complete normal connection and at least 10 minutes of stable presence. Resolve the unknown target transport version, actual framing, and encryption layers first.
3. Once runtime results can be observed, evaluate both native `RakNet.dll` reuse and the generic `raknet-native` transport path, recording how far each reaches in the connection lifecycle.
4. Continue checking EOS/EAC initialization and ongoing sessions against real-client evidence. Report server admission as implemented only after real player initialization, required authentication, and sustained connection are demonstrated.

This round added native-transport evidence, verifiable candidate libraries, and concrete capture preparation. A complete independent Rust client and valid EAC session were still unimplemented at the time of this report.
