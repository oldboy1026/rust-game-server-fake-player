# Independent Steam tickets and Rust transport test

Historical observation: 2026-10-24, `61.147.247.35:28015`. [Original](independent-connection-2026-10-24.md); [sanitized evidence](independent-connection-2026-10-24.json). This target differs from the earlier research servers.

An independent Python process directly loaded a hash-verified x64 RakNet.dll from the installed game. An eight-second transport test received 0x10 (accepted) and0x9d (identity requested), then closed normally without submitting identity. No new Steam desktop or Rust process was started. An independent Node Steam session issued ownership, session and encrypted-app tickets for AppID 252490, respectively 184/240/143 bytes. Ownership/session signatures, expiry, account and app were checked; this instance's ticket was canceled and buffers zeroed afterward. Reports/APIs omit tickets, identities, passwords and anticheat identities. Local issuance/verification does not replace server authentication or EAC.

The first identity test ran 60.078 seconds, received Approved with encryption 0, sent minimal Ready and received 10, 078 application messages:1320 Entities, 6257 EntityPosition, 935 RPC. It observed no disconnect/EAC message and closed at its local time limit. Continued mode then matched `Entity.basePlayer.userid` only against its own Steam identity, obtained its own entity and received its thirteen-byte FinishLoading RPC, ID2811987493. ManifestHash and two genuine reconnects corroborated the RPC identity. This supports server PlayerInit/EnterGame for this account. A 146.922-second session stopped gracefully through the API with native/ticket cleanup; a webpage reconnect again obtained own entity/FinishLoading. A later 271.672-second sample remained entered_game after 59, 449 messages.

The existing official Steam/Rust clients were retained as observation baselines; no repeat with both completely closed was performed. The independent process used its own Steam login/new ticket rather than original-client memory/IPC. It still requires a compatible installed native RakNet library. Before/during/after queries changed A2S/cp from 9/7 to 10/8 and back to 9/7. PLAYER names did not match the local nickname, so individual identity proof came from own-entity matching, not names. The old players−cp difference of 2 remained unexplained.

The inspected server can advance internal EAC status directly when secure is disabled. Such admission is different from a valid protected EAC session and cannot be generalized to EAC-enforcing servers.

## Frame alignment

Reconnect captures contained 82, 822 endpoint packets:43425 connected datagrams, 39378 ACK, 11 NAK and8 offline handshakes; 52322 frames included1760 fragments forming589 complete groups. Datagram/ACK/NAK boundaries parsed exactly. Frame payload begins at UDP offset8: one flag byte, four low timestamp bytes, three sequence bytes. Every ACK timestamp matched its referenced opposite-direction datagram. This matches upstream RakNet's `INCLUDE_TIMESTAMP_WITH_DATAGRAMS=1`/UDT branch, rather than proving a private Rust field. Bit lengths, fragment integers and ACK counts are little-endian.

Both observed identity packets were 1306 bytes, with seven u32LE-length-prefixed strings/arrays; ticket 240, anticheat identity 32, anticheat token 940 bytes. Only lengths were inspected. Protocol 2635, marker 228, changeset 168909 and build time matched. Ready was0x90 plus 982 protobuf bytes and 28 ClientInfo name/value items, with no top-level globalNetworking/party. Hardware data must not be copied as another client's identity.

## Interfaces and boundaries

`POST /v1/accounts/{id}/rust-auth-check {}` returns issue/verify/cancel metadata. `POST /v1/accounts/{id}/rust-session {host,port}` starts continued mode, GET reads stages/counters/own-loading flags, DELETE stops it. At this report's date it received world data/maintained native transport but had no PlayerTick/world simulation or valid EAC. Later action reports supersede that historical feature boundary.

`native-peer.py` is a bounded transport probe; `analyze-raknet-frames.mjs` defaults to boundaries/first-byte summaries, with optional `--inspect-application-shapes` for lengths/protobuf fields. New tickets travel over an anonymous local pipe and are canceled after network-process exit; old captured tickets or another identity's EOS/EAC token are not reused. See upstream [timestamp switch](https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.h#L40).
