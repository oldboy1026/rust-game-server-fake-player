# Research Status and Next Experiments

[Project README](../README.md) · [Code guide](CODE_GUIDE.md) · [English report index](ENGLISH_INDEX.md)

This is the English research overview for the 2026-10-27 publication. The dated reports and their JSON evidence describe what was actually observed; build-specific findings must be checked again after an update.

## The questions being investigated

The project investigates independent Rust player connections and the relationship between server-internal players, Steam authentication, public query replies, and the population shown in Rust's browser. Those questions have several separate layers:

1. Steam login and game ownership/ticket issuance.
2. Rust transport, identity submission, approval, Ready, own entity, and FinishLoading.
3. A valid EAC-protected session accepted for Rust's actual product and the current server.
4. Server-side player/connection state and publicly published query data.
5. Facepunch's aggregate public population and its later cached batches.

Completing one layer does not establish the others. A genuine Steam account can receive a valid Steam ticket while an independent program still lacks EAC. A server hook can run and a player object can exist without proving which public-count source or acceptance rule is used.

## Current evidence

| Area | Observed result | Limit |
| --- | --- | --- |
| Steam management | Concurrent logins, token restoration, account features, inventory, licenses, and game-activity reporting | Does not establish Rust admission |
| Independent Rust connection | Own ticket, native transport, identity submission, approval, Ready, own player, and FinishLoading observed on tested configurations without EAC enforcement | Not general current-EAC compatibility |
| Sustained connection/chat | Historical sessions remained connected; ordinary global messages were matched in server chat records | Send acceptance and server confirmation remain separate |
| Wake/respawn/actions | State-gated input and post-send state observations; wake Sleeping clearance observed on an inspected configuration | Not a complete client or proof of public-list acceptance |
| Steam activity association | A controlled ticket/server identity association comparison produced no observed public increase | Candidate is not a validated fix |
| Public count reads | Facepunch map and query-source comparisons available with cache metadata | Aggregate map does not identify accepted accounts or expose backend rules |
| A2S reply proxy | Local original 0, proxy 2, two marked test entries, unchanged `cp=0` | Registered public UDP path not taken over; no Facepunch increase verified |
| EAC probe using installed settings | Local platform creation failed with an invalid/missing client-ID category in the recorded run | No valid Rust EAC session was created |
| Rust+ review | Companion WebSocket information/pairing path identified | Not player admission or an EAC-session replacement |

The repository does not claim that a public-backend fix or a working EAC session was found. Historical official-client observations also do not authorize the independent program to borrow or share that client's session.

## Priority 1: Reproduce the current connection boundary

Record the exact Rust build/protocol, native DLL hash, server configuration, and query/game endpoints. Use a test account that owns Rust and one controlled connection. Preserve existing user sessions instead of automatically reconnecting a historical account list.

Measure each admission stage separately, including the exact point where EAC or unsupported encryption is requested. A worker's local stop is different from a server kick after completed admission. A current negative result should be recorded as such rather than deleting the stop condition to report success.

Acceptance for independent ordinary admission requires a real server-side connection associated with the correct account, observed own entity and FinishLoading, a bounded stable interval, and clean ticket/worker teardown. Any test excluding official Steam/Rust processes should explicitly record that condition; earlier tests retained those processes as observation baselines and did not complete every such repeat.

## Priority 2: Establish a supported Rust EAC session

An EOS SDK binary or Rust's installed product/sandbox/deployment identifiers are insufficient to demonstrate that a newly written application has authorization and identity for Rust's anti-cheat product. Steam tickets cannot substitute for EAC, and a generic EAC integration for a different product would not establish Rust authentication.

The next useful material would be a supported integration path for this Rust product, its valid identity/bootstrap prerequisites, and a way to validate the resulting session on an EAC-enabled test server. Inspect public SDK documentation and owned, authorized integration material. Distinguish SDK initialization, platform creation, identity establishment, session start, message transport, and server authentication.

Acceptance requires a current EAC-enabled server to recognize that same test account's session as authenticated and maintain it through the intended observation interval, with independent server-side evidence and clean shutdown. A local `BeginSession` call, `secure=true` in a server list, an EAC-named message, or a Steam validation callback does not satisfy this criterion by itself.

No reusable tickets, identity secrets, memory dumps containing credentials, or other users' sessions should be included in shared evidence. The objective is verifiable authentication, not an unobserved claim inferred from a library export or configuration file.

## Priority 3: Test the complete public query path

The proxy is ready for a bounded administrator-operated test, but the recorded experiment reached only the local proxy. A proper public-path experiment needs the actual Steam-registered query endpoint and the server host/panel's UDP forwarding layout.

1. Save the original public-to-backend UDP mapping and a concrete rollback configuration. Record the game endpoint separately from the query endpoint.
2. Collect original INFO/PLAYER, `cp`, real internal connection counts, and Facepunch count/batch metadata. A missing public entry is unknown, not zero.
3. With zero added entries, route the existing registered public query endpoint through the proxy to a distinct original query listener. Do not let the proxy and game process compete for the same socket.
4. Query that registered endpoint from outside the server host. Match the Rust/game-port identity and demonstrate that the proxy's request counters increase. Merely querying an unrelated temporary port is insufficient.
5. Run a short, bounded test with one clearly marked added entry. Compare the changed A2S values with the unchanged genuine connections/`cp` and with independent new Facepunch batches.
6. Stop the test, restore the saved UDP mapping, and verify external queries work through the original path again. Proxy expiry does not automatically undo a panel/NAT rule.

Windows `netsh interface portproxy` is TCP-only and cannot route A2S UDP. The actual maintenance procedure depends on the hosting topology; do not assume an unverified forwarding command or a second listener automatically changes Steam registration.

Acceptance for a public-count change requires multiple genuinely new `Last-Modified` batches, a known public path, recorded real-player changes, and a repeat/restoration comparison. A changed A2S_INFO byte alone does not establish Facepunch acceptance. The public map is aggregate; even an aggregate increase cannot identify which particular account was accepted without additional evidence.

## Priority 4: Understand source selection and avoid confounded comparisons

Record the client/browser under test: Rust's browser, Steam's list, GameDig, BattleMetrics, or a custom website can use different sources. Retain server-internal active players, network connections, A2S players/bots, `cp`, Steam GMS counts, Steam `GetServerList.players`, and Facepunch values separately.

Keep a baseline window, change one variable, then restore it. Track natural joins/leaves and official-client activity. Record `Date`, `Age`, `Last-Modified`, cache status, observation time, and endpoint. Several reads of an unchanged cached batch are one observation of backend data, not several independent updates.

Server plugins/extensions can help observe current internal counts and ordinary reporting calls. A plugin's successful load or refresh invocation does not prove backend acceptance. Artificial display data and test aliases must remain labeled; an administrator-only simulated network view is not a new external source IP or a real latency measurement.

## Priority 5: Maintain a small, reproducible client implementation

Continue versioned schema checks for approval, identity, Ready, own state, FinishLoading, and permitted actions. Keep parsing bounded and preserve sequence/freshness checks. Read-only static disassembly can identify candidate paths, but every ABI assumption must match the actual binary hash and architecture.

For actions, validate state and release behavior before sending and stop on unsupported conditions. Small input traces without loaded terrain and client physics cannot establish a complete gameplay simulation. Rendering settings in the official game are a separate resource optimization question; they do not turn a full client into an authenticated lightweight protocol worker.

## Evidence and report layout

Keep raw captures, account bindings, runtime logs, paths, cookies, and tickets in ignored `captures/`, `work/`, or application `data/`. Public reports should include build identifiers and source hashes, bounded observation times, sanitized aggregate results, exact failure categories, and explicit unverified claims. Preserve immutable historical evidence rather than editing an old negative result into a success story.

Useful starting reports include the independent connection study, installed-settings EAC test, official-session reuse review, Rust+ review, public-backend review, Steam association experiment, runtime repair, player actions, and query-proxy integration. The [English report index](ENGLISH_INDEX.md) provides the available translated records and corresponding originals.

## Share findings

If you have a verified solution that increases the player count shown in Rust's public server list, or establishes a valid Rust EAC-protected connection, please contact **[oldboy1026@gmail.com](mailto:oldboy1026@gmail.com)**. Please share your findings; the project owner may be willing to pay for a working solution. Include reproducible behavior and validation evidence, not account passwords or reusable authentication material.
