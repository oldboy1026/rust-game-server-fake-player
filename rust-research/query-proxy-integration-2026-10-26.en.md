# A2S query proxy integration and live query comparison

Historical report: 2026-10-26, Asia/Shanghai. See the [original report](query-proxy-integration-2026-10-26.md) and [structured evidence](query-proxy-integration-2026-10-26.json).

## Implemented behavior

The two core functions of [server-query-fake-player-count](https://github.com/anatolykopyl/server-query-fake-player-count), reviewed at commit `ffd3edd24466dc4b40a5521fbc7cc666672947d2`, were reimplemented in Node.js: changing A2S_INFO's player count and appending A2S_PLAYER test entries. No Go source was copied; Go, Docker and additional npm dependencies are unnecessary.

- `steam-multi-account/src/rust-query-proxy.js` preserves existing player entries and Rust's `cp` tag. Added records are explicitly named `[A2S TEST] N`. The default addition is zero; the maximum is 50, further bounded by capacity and the one-byte count.
- Each querying client retains one upstream UDP socket, allowing source-port-bound challenges to complete. Uncompressed split replies are reassembled; large outgoing replies are split. Compressed fragments are unsupported and produce an error.
- Request rate, client count, timeouts and fragment sizes are bounded. Only INFO, PLAYER and RULES queries are accepted. Status contains aggregate metrics rather than real names or querying-client addresses.
- Bearer-protected local routes are `GET/POST/DELETE /v1/rust/query-proxy` and `POST /v1/rust/query-proxy/sample {}`. Dashboard listeners bind only to loopback. Sampling compares original A2S, proxied A2S and Facepunch data with cache metadata.
- The `/rust` controls were verified in a real browser. The standalone runner requires explicit public-listener selection and stops after a 10–900 second window. Its portable package includes only three public source files, documentation, module configuration and a SHA-256 manifest.

This proxy does not create Rust players or EAC sessions. `publicPathVerified` and `effectiveEacEstablished` remain false; changed query replies are not represented as backend acceptance.

## Live observations

Game endpoint: `61.147.247.25:40176`; upstream query port: `40177`. The reply identified Rust and reported the matching game port. Steam query-port discovery failed during this round, so no fresh registration proof was obtained.

| Observation | Result |
| --- | --- |
| Original INFO | players 0, maxPlayers 200, cp 0 |
| Loopback proxy, addition 2 | players 2, maxPlayers 200, cp 0 |
| Proxied PLAYER | count 2; two explicitly named test records |
| Running service API | HTTP 200; original/proxy 0/2 and cp 0/0 |
| Facepunch mapping | `target_not_listed`; absence must not be interpreted as zero |

The module test ran at 16:40:38, the successful API sample at 16:44:22, and the browser showed the same comparison at 16:45:03. Successful Facepunch responses had `Last-Modified` 16:39:55; the 08:40 and 08:44 UTC reads were the same batch. The first browser public-data request failed and displayed unknown; a later request obtained the batch metadata. Neither failure nor repeated cached data was treated as a count result.

The proxy listened only locally. The public UDP path was not intercepted, so **a Facepunch public-count increase was not verified**. No valid Rust EAC session was established.

## Validation and service preservation

All 68 Node tests passed, including ten proxy tests for counts, challenges, fragmentation, PLAYER, timeout cleanup, authorization and API sampling. The dependency-free deployment package was also run: two test records were returned, the ten-second window exited naturally with code 0 and no stderr, and no query clients remained.

Before the controlled reload, live state showed 48 Steam accounts online and zero active Rust sessions. Current accounts/settings were saved privately, the old service stopped normally, and one replacement service started. All 48 Steam logins recovered with unchanged `autoConnect` settings. No historical five- or sixteen-player roster was recreated. At 16:46:50, Steam remained 48/48, Rust connections were zero, and the proxy was stopped with zero clients.

No remote firewall, game configuration, plugin, UDP mapping or public registration was changed. No account data or remote credentials were uploaded. Private API snapshots remain under ignored workspace `work/query-proxy-integration/`; the public JSON contains only aggregate evidence.

## Remaining experiment

The operator confirmed that the hosting panel supports UDP forwarding. The panel address and current public-to-backend mapping are still needed. Preserve the old mapping, route the **registered public UDP query endpoint** through the proxy, and retain a distinct upstream endpoint. Merely opening an unused temporary port is insufficient.

First test addition zero from an external host and verify proxy counters. Then use a short addition-one window and compare genuinely new Facepunch `Last-Modified` batches. Restore the original mapping afterward and verify recovery; automatic proxy expiry does not undo panel forwarding. See [deployment instructions](../server-upload/query-proxy/README.en.md). Windows `netsh interface portproxy` forwards TCP, not UDP.
