# Runtime repair and verified level-1 admission

Historical report: 2026-10-26, target `61.147.247.25:40176`. [Original](runtime-repair-2026-10-26.md); [stages, hashes and limits](runtime-repair-2026-10-26.json). Private raw evidence remains under ignored `work/runtime-repair/`.

Two independent causes were repaired. First, after a computer/data-directory change, `data/rust-runtime.json` and environment DLL/Python paths were missing; connection stopped before ticket acquisition. Displaying that error had not restored the runtime. Second, the server's Approval requested `encryptionLevel=1`; the old worker rejected all nonzero levels. In this protocol version, level 1 is ordinary XOR obfuscation, not automatically EAC. Earlier level 0 admission had not exercised this compatibility path.

## Native compatibility

The existing Windows x64 PE32+ RakNet library came from dedicated-server app 258550, depot 258551, manifest 93946663446561466. Size:312656 bytes; SHA-256 `a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21`; Authenticode Valid, Facepunch Studios Ltd. No game binary is distributed in Git.

Objdump/ABI checks covered NET_Create at0x18d0, NET_Close0x17e0, NET_StartClient0x1e60, NET_Receive0x1d10 and send/receive field widths. Receive returns bool in AL; its buffer is borrowed only until the next receive/close. Matching export names alone were not considered compatibility proof. A no-socket create/close subprocess passed, then a five-second transport-only target probe received 0x10/0x9d after StartClient=0 and closed without identity submission. Only then was this exact hash added to Node/Python support lists; unknown hashes remain rejected before native loading.

Configuration stores `{dll,python,sha256}`. An environment override must not inherit another saved DLL's hash; API metadata records the actual supported hash. The local runtime was Python3.12.14 x64. Machine paths/configuration remain private.

## Level1 codec

Static dnlib/RVA inspection did not execute game managed assemblies. Assembly-CSharp.dll hash was `71c50c6f0a48f67702cc2328e255e0000803919599c6fea6705cc22c3aa94601`; Facepunch.Network.dll hash was `864ecda900aaa64f3908c4dc0fc012d6857a5f9a8df3467130bbaa304fc9e833`. NetworkCryptographyServer uses EACServer Encrypt/Decrypt above level 1; the lower handler calls Craptography.XOR using protocol 2635. BaseNetwork bypasses level 0, so ordinary obfuscation applies only to level 1.

`rust_packet_codec.py` preserves the header and processes selected payload types1..27 according to EncryptionPerType, restarting each packet at `2635 % 256 = 75` in a256-byte table. Table hashes: `3682c3d0020436c45462995a4f64438c144bbfeba725b00de5906ab322b6b915` and type table `89ba46b3662e51e173cf7317420e88c32553305fd1af395c8b0e6d91dab1f060`. Borrowed native buffers are never modified. Chat, respawn, bounded wake and maintenance share the codec and existing own-entity gates. Level≥2 and0xA2 EAC messages still stop. No EAC/protection configuration was changed.

## Live results

At 12:11:20 Beijing time, one idle online account reached level 1 Approval and the old guard stopped before Ready; its ticket became inactive. After the codec fix, the same target attempt began12:15:53, observed the own entity12:15:57, and first reached `entered_game`/own FinishLoading/serverValidationObserved at12:15:59. At 12:17:58 the same startedAt remained active with continuing packets; the last complete own snapshot was alive/sleeping, and its age remained explicit. No chat, respawn or wake was sent.

A separate48-account batch, not initiated by this test, appeared12:17:23 and reached five entered_game by12:18:27. It was preserved and not counted as this test. Steam discovery gave40177; at12:17:58 INFO had players5, cp3, VACsecure=false, protocol 2635. Facepunch omitted the endpoint; absence was not zero or a count repair. VAC flags are not EAC-session evidence.

All 54 Node and45 relevant Python tests passed: hash propagation/preflight, fixed codec vectors/reset/type selection/wrapping, level 1 own-entity/FinishLoading, maintenance/wake encoding, rejection of another entity as admission, and continuing EAC/higher-level stops. Level1 chat/respawn reused tested sending code but were not live-tested. Worker changes did not require another main-service restart; continued Rust sessions do not automatically recover after service restart.
