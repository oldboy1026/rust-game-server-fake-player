# Batch admission, browser readings and simultaneous disconnection

Historical experiment: 2026-10-24. [Original](bulk-count-observation-2026-10-24.md); [samples and evidence hashes](bulk-count-observation-2026-10-24.json). Public population repair was not verified. The operator reported **13 players after manually refreshing Rust's list**, agreeing with the public API; exact refresh time and a screenshot were unavailable.

Of 39 Steam-online accounts, three existing Rust sessions were preserved and 36 received one normal attempt each. Ultimately 38 entered the world; one Steam-auth refusal stopped without bypass or retry. UTC observations:

| Time | Result |
| --- | --- |
|10:03:14|Baseline research 3, others 14, public 12|
|10:06:41.153|First joint confirmation of research 38/API entered_game 38; roster 52, A2S 54, cp 52|
|10:06:41.965|Planned 1, 200-second observation timer starts|
|10:07:12.940|Public13, new batch10:07:01|
|about10:08:47|Operator reports browser13; refresh time unknown|
|10:10:12.304|Last sample jointly confirming all 38 present|
|10:10:42.587|All38 transition stopping then error; transport ends|
|10:12:42.426|API activity0; roster unavailable; public 13 batch10:12:05|
|10:17:12.174|Research0, public 14, other roster changed|
|10:20:15.817|Temporary connection limit restored and read back as5|
|10:22:14.357|Research0, public 15 batch10:22:03|

The first/last valid38-player samples span **211.151 seconds**, not twenty minutes of successful presence or continuous packet proof. A continuing timer or phase named connected_observation does not convert a disconnected interval into success. Other connections changed14→15→14 and later identity sets changed. Public12→13→14→15 did not resemble35 additional successful admissions; later increases occurred with research 0. No increment can be assigned to an individual research account. Probe.other included some identities outside focus; classification here instead used all 39 private identities against the real roster.

Steam logged all 39 reconnecting within17ms at10:10:40.490–.507. Game and management traffic also failed; no new application disconnect_reason_received was observed. The operator explicitly reported the computer's Wi-Fi lost internet. This supports a shared connectivity interruption rather than server kicking or the temporary IP limit, without precise packet-level ordering.

Ticket observability matters: offline/unavailable `activeSessionStatus()` returns available=false, active=false. That false is not cancellation acknowledgment. The old driver's ticketInactive/ledger fields did not check availability and cannot prove every historical cancellation. Keep transport closure, server absence, readability, current emptiness and cancellation receipts separate.

The operator specifically authorized global maxconnectionsperip5→50 for this experiment, then restoration5. An independent tool read50, restored 5 and verified it10:20:15.817. No security/count settings or server restart changed. The driver naturally ended10:26:47.772, 49 samples, exit0, no rollback pending; that means cleanup/timing completion, not twenty-minute admission. APIs returned 39 sessions in all49; rosters 37, A2S 45, public 43 samples succeeded. Missing final public data was not zero. First resumed roster proof of research 0 was10:16:42; earlier missing roster samples were not invented.

At10:27:14 an independent all-source check confirmed limit 5, research 0/others15, all 39 Rust sessions error and native wrappers closed, Steam 39 online, tickets readable/inactive, and all 36 created-session startedAt values matched without replacements. Current emptiness does not retroactively prove past cancellation callbacks. No second batch/count plugin ran; no temporary setting or game cleanup remained. Steam recovery does not imply automatic Rust reconnection.

A receive-only wake candidate remained ignored/offline. Thirteen synthetic tests/500 random inputs passed, but review found it mishandled live-player snapshots omitting default life state; it was not integrated or treated as usable input/eligibility evidence. Subsequent work should distinguish shared network failure, real layer counts and unavailable tickets rather than fabricate activity/authentication/reporting. Private identities/admin data remain excluded from Git.
