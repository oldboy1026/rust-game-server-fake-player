# Fourteen existing connections versus public eight: passive review

Historical review: 2026-10-25, 02:24–02:37 Beijing time. [Original](fourteen-session-count-investigation-2026-10-25.md); [samples/builds/evidence](fourteen-session-count-investigation-2026-10-25.json). The operator had connected the accounts. This round created/stopped none, changed no server setting and installed no diagnostic. Backend eligibility/public repair remained unknown.

Baseline18:24:13–18:25:37UTC:39 Steam online, fourteen entered_game and all matched in roster 21, others7, cp21, exact SteamCMauth_players 21, public 8. Sessions had run 323–2157 seconds with observed server ticket validation. Five had three-frame wake/awake evidence; nine had one interrupted frame. A persistent read-only RCON sampled 601.194 seconds, eleven times 18:27:07–18:37:08, with 33/33 source checks/no parsing failures and classification against every current saved identity.

| UTC window | Research/other/total | cp | Tick-positive | Public/batch |
| --- | --- | --- | --- | --- |
|18:27|14/7/21|21|7|8, 18:23:06|
|18:28–31|14/7/21|21|7|7, 18:28:07|
|18:32|14/8/22|21|8|7, 18:28:07|
|18:33–37|14/8/22|22|8|8, 18:33:07|

Research identities never changed; one other joined. At18:36:51 all fourteen retained entered_game, startedAt, active/validated tickets and unchanged cumulativeTicks; SteamCMauth_players 22. Other-list not_found is not zero, and a default decoded eresult is not an auth rejection. Two new public batches defeat an “only stale01:53 cache” explanation, but correlation with others/tick-positive does not identify accepted identities or a formula. cp's one-sample lag fits the30s cadence. A2S stayedcp+2, unexplained, and no game-browser screen was observed.

The worker's once-only1–3 Tick frames followed by ClientKeepConnectionAlive differ from continuous ordinary input. The inspected keepalive handler updates lastTickTime but not rawTicksPerSecond; actual PlayerTick increments it. This is a research lead, not proven public eligibility, and old inputs/coordinates were not looped to inflate metrics. Baseline active 21/alive 20/sleeping 9 cannot yield public 8 by simple sleep/death subtraction. secure=false, encryption 0, EACinterface/handles 0 also do not identify the sole cause. IP hypotheses are confounded: earlier 12 connections/8 IPs versus 21/7; historical no-research samples had 10/11 IPs versus public 7/9, and a research-only window had public 0 across new batches. No IP formula was recovered.

Read-only stats 18:28:05/18:36:51: dryrun=false, gameplayanalytics=false, tickanalytics=false, performance=true, eac_gameplay_data=true, FPApi(server)enabled, Azure tick uploaderoff, player_ticks_release 0. Events 13554→13559, Total/UploadedBytes+857, queues0; no wholesale reporting stop was observed. Serialization/aggregate-upload bytes are not per-account receipts. No Flush/replay/toggle occurred.

Original BUpdateUserData's hidden bool remained a useful diagnostic. Existing focused observer/bridge were rebuilt against real references with unchanged inputs; both builds passed, not remote runtime validation. Target MVID matched the guard but not a full byte identity. A private reviewable ZIP held the observer, bridge, classification of fourteen current identities plus up to six idle candidates, instructions/build records/hashes; all seven file hashes matched. It contained no passwords/API keys/tickets, and identities were excluded fromGit.

Only RCON was available, so upload needed the operator's file channel. Planned observation was≤180s, possibly one new preclassified idle account with exact-startedAt cleanup, while preserving fourteen; official unload plus same-startedUtc patchInstalled=false/unloaded=true and file removal were required. Deadline expiry alone is not unload. It was a diagnostic, not a public-count fix. Same-IP limit 50 was read only. The main service/fourteen games stayed unchanged, and raw roster/address/account/configuration evidence remained private.
