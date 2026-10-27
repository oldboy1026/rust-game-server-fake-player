# Work archive and final state

2026-10-24, Beijing time. The user requested a summary, push, and end to that research round. This is its final entry point. Phrases such as “continue tomorrow,” “running,” or “awaiting approval” in older reports describe historical states, not instructions to resume execution. Later dated reports supersede this historical archive where applicable.

**Account management, independent normal server entry, the bulk-management webpage, and multiple read-only diagnostics were completed. Public-list population repair and Facepunch backend eligibility rules were not verified. Account chat, walking, and AI control were not implemented as of this archive.**

## Results and evidence index

|Work|Final conclusion at archive time|Primary material|
|---|---|---|
|Steam multi-account management|Local service, management, and normal authentication implemented; credentials and sign-in data remain private|[Service guide](../steam-multi-account/README.md), [source](../steam-multi-account/src/)|
|Independent Rust connection|Tickets, handshake, approval, own entity, and world-entry confirmation completed under the documented compatible configuration; persistent connections and normal cleanup supported|[Connection report](independent-connection-2026-10-24.en.md)|
|/rust bulk webpage|Account names, multiselect sign-in/connect/disconnect, logs, groups, and import results; Guard requests correctly skipped; displayed system counts are not public counts|[Workspace report](rust-workspace-2026-10-24.en.md)|
|Shutdown-result error|Fixed a repeated-rejection KeyError so it would not overwrite the original rejection; not a universal abnormal-exit fix|[Fix](worker-rejection-fix-2026-10-24.en.md)|
|Normal-client observation|Earlier entry, reconnect, and local relay windows observed; later NPC discussion did not restart full client capture|[Client observation](client-observation-2026-10-24.en.md)|
|Count query/reporting paths|RCON, A2S, cp, and Facepunch counts distinguished; applicable client display and normal server update paths analyzed|[Deep review](count-query-reporting-deep-2026-10-24.en.md), [server paths](server-reporting-paths-2026-10-24.en.md)|
|Lifecycle/respawn|Own life-state evidence and limited comparisons obtained; repeated public-count changes were not stable and other players confounded attribution|[Initial](respawn-observation-2026-10-24.en.md), [repeat](respawn-repeat-observation-2026-10-24.en.md), [own state](resume-own-state-2026-10-24.en.md)|
|User-supplied FakePlayers.dll|Static analysis only; obfuscation and one local collection-compatibility issue confirmed; not executed, installed, or proven to fix counts|[Static review](fakeplayers-static-2026-10-24.en.md)|
|Read-only diagnostics|Actual builds, isolated checks, and some local/target runs; preparation, execution, and unloading distinguished per tool|[Target Probe](playercount-probe-target-2026-10-24.en.md), [local Observer](reporting-observer-local-2026-10-24.en.md), [local snapshot](count-snapshot-local-2026-10-24.en.md)|
|Bulk-count observation|Peak 38 research connections; 20-minute presence not achieved; public changes not attributable to them|[Final report](bulk-count-observation-2026-10-24.en.md), [JSON](bulk-count-observation-2026-10-24.json)|
|Offline receiver candidate|Synthetic checks passed but normal Alive-snapshot compatibility defect found; not integrated or enabled|[Negative result](bulk-count-observation-2026-10-24.en.md), [input boundaries](wake-input-boundaries-2026-10-24.en.md)|
|NPC AI discussion|Static interfaces and draft design only; user did not adopt server-side NPC approach; no running AI feature|[Design status](npc-ai-design-status-2026-10-24.en.md)|

Earlier entry points: [initial report](研究报告.en.md), [second research round](research-update-2026-10-23.en.md), [count summary](player-count-update-2026-10-24.en.md). The original [archive index](FINAL-ARCHIVE-2026-10-24.json) records tracked file sizes, categories, and SHA256 hashes at that archive time; it excludes its own digest to avoid a circular hash. New translations are not retroactively covered by that historical index.

## Confirmed facts and unresolved questions

- The program could establish its own Steam session and Rust connection without calling desktop clients for those flows; that is not a complete official client. Early experiments retained existing desktop processes as a baseline; no comprehensive repeat with both closed had been accepted.
- No valid EAC-protected session was implemented. Cached authenticated flags, successful tickets, or profile-update return values do not prove a protected session.
- The analyzed applicable client branch limits displayed population with `max(0,min(cp,FacepunchCount))`. Public data produced new batches approximately every five minutes; read time and publication time are recorded separately.
- Facepunch backend eligibility/counting algorithms were not obtained. Observing a client request, successful byte upload, or increased server count does not independently prove backend acceptance.
- No repeatable entry→public increase/departure→public decrease relationship was established for research connections; no count-repair DLL was verified.
- Sleeping, missing movement input, or an undeployed DLL was not proven to be the reason for nonacceptance. Nor was every real-client entry proven to immediately increase public counts.
- Chat, movement, following, patrol, and core AI were not implemented at this archive time. NPC draft checklists were proposals, not completed tests.

## Experiment closure and archived runtime state

The bulk experiment ended at **18:26:47**. First-to-last valid matched samples for 38 sessions spanned 211.151 seconds, then connectivity failed. The user confirmed the computer's Wi-Fi had no network, consistent with joint loss. Finishing the observation timer does not mean sessions lasted 20 minutes.

The temporary same-IP connection limit was restored 50→5 at **18:20:15**, and independently rechecked as 5 at **18:27:14**. Research connections were then 0; 39 readable ticket states were empty. The old gameplay_analytics experiment had also restored its original value as documented. Archiving did not modify the target again or rerun experiments. These are timestamped checks, not permanent-state guarantees.

Another read-only local-service check at **19:05:11** found:

|Item|Then-current state|
|---|---|
|Local dashboard|Health check succeeded|
|Steam accounts|39, all online|
|Running bulk jobs|0|
|Rust sessions|entered_game 2, error 37|
|Tickets|39 readable; 2 active, 37 inactive|

Both entered sessions started after the old bulk driver ended and did not match its exact owned startedAt values. They were preserved. No account was signed in/disconnected, webpage service restarted, or game process operated. The old statement “research connections 0” must not describe that later webpage state. User actions and networking can change it afterward.

## Diagnostic deployment state

|Tool|Evidence available|
|---|---|
|PlayerCountProbe|User uploaded to target; real commands/sampling verified; archive did not unload it|
|ReportingObserver/CountSnapshot|Documented local bounded runs completed; unloaded and run-specific copied DLLs moved out|
|ReportingObserverFocused/ObserverStateBridge|Prepared, built, isolated checks; no verified target deployment|
|ReportingDiagnostics/CountDiagnostics|Only their documented compilation/preparation evidence; not target execution|
|Supplied FakePlayers.dll|Never executed or installed|

## Verification and retained material

Historical checks included 35 Node webpage/service tests, 5 worker-rejection groups with 11 cases, 4 synthetic parent-process integrations, and limited real regressions documented in reports. Diagnostic build, isolation, and execution evidence remain distinct. Archiving did not rerun those checks or account experiments.

Archive work checked document links, JSON, source hashes, privacy, and local/remote Git agreement. The complete index locates code/reports/evidence; it does not establish that every candidate runs.

Passwords, sign-in data, API keys, administrative credentials and real admin endpoints, identity rosters, raw captures/logs, unknown DLLs, downloaded game binaries, and build intermediates remained in ignored local directories. Public material contains sanitized conclusions, relative paths, and necessary source hashes. **Cloning the repository does not restore private local material.**

The research round ended after this archive. No automated experiment, bulk reconnect, or future wake was scheduled. A future maintainer must read this archive and check fresh state rather than execute old experiment scripts directly.
