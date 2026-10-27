# Rust batch-account workspace and verification

Historical implementation: 2026-10-24. See the [original report](rust-workspace-2026-10-24.md). Historical online-account counts below are not current state; all imported accounts were deleted on 2026-10-27.

The localhost /rust page added account names, multiple selection, login/connect/disconnect actions, per-account logs, server grouping and row-by-row imports. Management IDs were removed from ordinary homepage display/input but retained internally for APIs.

Imports split each account: password line at its first colon, retaining later colons and spaces in the password. Limits are 200 lines, 128 KiB JSON and two login workers. Guard requirements stop without email/verification automation. New failed, timed-out or Guard-required accounts are removed; existing records and connections remain. Persistence failures are explicit and stop the affected client rather than falsely claiming deletion. Input clears on submission. Passwords do not enter jobs, logs or saved storage; successful refresh tokens use encrypted storage.

Batch connections are spaced five seconds apart and skip existing active sessions. Started is distinct from admitted: own-entity matching and FinishLoading determine final state. Dashboard counts represent this system's open entered_game sessions, not the public browser. A2S supplies server names with an IP/port fallback; names are rendered as text. Player-state displays include latest-snapshot age and mark closed-session state historical. Respawn defaults off.

Logs retain 200 entries per account and jobs retain twenty batches in memory. A service restart requires deliberate Rust reconnection. No indefinite reconnect or Guard automation was added.

Six isolated import-test groups covered passwords, Guard, timeouts, duplicates, colons, concurrency, shutdown, existing records and disk failure. Other tests covered selection, targets, per-account errors, names/counts, disconnect, HTTP authentication/origin/body limits and log routes. All 35 tests passed.

A separate fake manager/page on port 3211 verified grouping, selection, logs, row results and disconnect 2 → 0/connect 0 → 2 without real account actions. Keyed checkbox/button retention repaired polling that had interrupted clicks. Simulation screenshots demonstrate UI behavior, not real admission or public population.

After the 15:11 comparison, the old service stopped normally. The new service returned healthy /rust responses with three historical Steam logins and zero Rust sessions. No games were automatically restored, and the simulator/tabs closed. Credentials, raw responses, identities and temporary test data were excluded from publication. This report has no same-name public JSON artifact.

Public population remained unresolved. See the [reporting-path analysis](server-reporting-paths-2026-10-24.en.md), [first respawn comparison](respawn-observation-2026-10-24.en.md) and [repeat](respawn-repeat-observation-2026-10-24.en.md).
