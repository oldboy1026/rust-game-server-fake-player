# Project handoff

Updated: 2026-10-27, Asia/Shanghai.

## Current work and publication

The owner requested deletion of every imported account, English web/documentation editions, and publication at https://github.com/oldboy1026/rust-game-server-fake-player.git. The target already has an initial README and Apache-2.0 LICENSE; preserve its history and license when merging the project. The previous Gitee repository remains a mirror.

**Account deletion is complete:** 48 accounts were removed through the running service. The live account list and decrypted local account store both contain zero entries. No Rust sessions were active. This deletion concerns this application's saved accounts and Steam logins, not deletion of the underlying Steam accounts. Never restore these accounts from older handoff records, local snapshots, encrypted backups, or reconnection scripts.

The current publication includes English project/setup documentation, code and research guides, English editions of historical reports and deployment instructions, and a Chinese/English web interface with project information. See `README.md`, `steam-multi-account/README.md`, `docs/CODE_GUIDE.md`, `docs/RESEARCH.md`, and `docs/ENGLISH_INDEX.md`. The original Chinese chronological handoff is preserved in `HANDOFF.zh-CN.md`; its login counts and process IDs are historical.

The README contact invitation is owner-authorized: people with a verified solution for increasing Rust's public server-list player count or establishing a valid Rust EAC-protected connection may contact oldboy1026@gmail.com; the owner may be willing to pay for a working solution. This is an invitation, not a purchase commitment. No email is sent by the project or agent.

## Verified behavior and unresolved work

- The Node.js Steam service supports separate account connections, Guard handling, encrypted saved login tokens, inventory/profile/license queries, and Steam game activity.
- The independent Node.js/Python Rust connection has completed admission, Ready, own-player entity observation, FinishLoading, connection maintenance, and public chat under the server configurations actually tested. This is not evidence of a valid EAC-protected Rust session.
- No validated standalone Rust EAC-protected client session has been established. A Steam authentication ticket, EOS platform initialization, Rust+ pairing, server secure flag, or plugin join event does not establish that result.
- Facepunch public player-count acceptance remains unresolved. Public maps contain aggregate counts, not per-account acceptance records. Compare new Last-Modified batches and record cache headers rather than treating repeated cached reads as independent observations.
- The A2S proxy implements query-reply modification from the reviewed server-query-fake-player-count concept. Actual tests on 2026-10-26 showed original INFO players 0, proxied players 2, two marked PLAYER entries, and cp 0/0. This changes query replies only. It does not create Rust players, EAC sessions, or prove Facepunch adoption.

The research protocol version was 2635 in the recorded observations. Do not assume later game builds or third-party servers share those conditions. See the English research index for dated findings, exact evidence, and limitations.

## Runtime and data

The local API/dashboard uses http://127.0.0.1:3210/ and the Rust page uses /rust. Static assets are loaded at service startup, so web changes require a controlled service restart. The encrypted store, API key, logs, and service lock live in ignored steam-multi-account/data/. Do not expose their contents.

Before any restart, read current status rather than relying on an old process ID or a historical active-account list. At the account-reset verification there were zero accounts and zero Rust connections, so there are no sessions to restore. Use POST /v1/service/shutdown with {} for graceful shutdown; wait for the old process and lock to close before starting a single new instance. Account restoration must remain empty unless the owner later imports new accounts.

Windows DPAPI ties saved encryption keys to the local Windows user. Do not publish or copy another machine's account store as a portable login. No credentials, raw packet captures, account stores, or local dependencies belong in Git.

## Query proxy and server deployment

The implementation is steam-multi-account/src/rust-query-proxy.js. The local Bearer API exposes GET/POST/DELETE /v1/rust/query-proxy and POST /v1/rust/query-proxy/sample with {}. Dashboard listeners are loopback only. Original player entries and Rust cp are retained; appended records are explicitly named [A2S TEST] N. Normal split replies and stable upstream challenge sockets are supported; compressed split replies are not.

The portable runner is tools/rust-research/run-query-proxy.mjs. Build-QueryProxyPackage.ps1 copies only three public source files, deployment instructions, type:module configuration, and a SHA-256 manifest into ignored work/. It requires Node 22+, no npm dependencies, and supports a bounded 10-900 second window. A real portable-package test returned two marked entries and automatically exited with code 0 and no remaining query clients.

The public UDP path has not been deployed. The owner confirmed that a hosting panel can configure UDP forwarding, but has not yet supplied the panel URL or current public-to-backend mapping. First inspect and save the current mapping and Steam registration. The registered public query endpoint must actually pass through the proxy while the proxy reaches a distinct original query endpoint. Merely opening another port does not achieve this. Windows netsh interface portproxy is TCP-only and cannot forward A2S UDP traffic.

Use a reversible maintenance window: verify addPlayers=0 passthrough from outside the server, then a bounded marked test, observe new Facepunch batches, restore the original mapping, and verify recovery. Proxy expiry only stops the process; it does not restore hosting-panel mappings. Do not claim this outstanding experiment succeeded based on local 0-to-2 results.

## Validation and safe continuation

The English UI/publication batch passed all 68 Node tests, including ten query-proxy tests. Syntax and translation coverage checks passed. All 67 historical research/tool/deployment documents have English editions; 416 local links across 75 checked documents resolved. Browser checks verified the English Steam and Rust pages, English/Chinese project guides, persistent language switching, English validation errors, and zero imported accounts. No live EAC or public-player-count success is implied by these software checks.

The service was controlled-reloaded for the new assets. Its startup completed after the driver's initial short readiness window; live verification then confirmed the new /about page and zero records in both API and encrypted storage. The already-running loopback query-proxy configuration was restored unchanged (50 marked query entries); this was state preservation, not a new public-path experiment. Read current status before future maintenance.

Raw local records for the previous proxy work were kept in the workspace-level ignored work/query-proxy-integration directory, distinct from the repository's own ignored work/. Those records may contain identities; do not publish them or rerun reload-service.mjs or older restore scripts. Public summaries are in rust-research/query-proxy-integration-2026-10-26.json and its English report.

Use normal non-forced Git pushes, retain the target repository's existing license/history, and verify the published branch SHA. The owner specifically asked to publish the contact email above; unrelated private addresses, credentials, and machine-local research material are not authorized for publication.
