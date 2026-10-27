# Official gameplay baseline and comparison with a project test account

Historical record, 2026-10-25. This batch first completed a read-only baseline for a normally played account. The user then manually moved one project test account to the official client. **The baseline did not verify a public-count fix.** The subsequent official-client and departure comparison is in [official-client-gameplay-control-2026-10-25.en.md](official-client-gameplay-control-2026-10-25.en.md) and its JSON. The same-name baseline JSON records frozen evidence and original-file SHA hashes.

## Completed baseline

Between 10:00:14 and 10:09:14 UTC (18:00:14–18:09:14 Beijing time), 19 samples were collected at 30-second intervals. Local management APIs, serial RCON, A2S/Facepunch queries, and server-identity queries all succeeded. The exact startedAt set for the original seven independent-program connections stayed unchanged. The server reported 13 players and cp 13: seven research accounts and six other identities, including the user's normal account that had been playing through the official client for approximately 4.5 hours. Every public value was 4.

Responses contained three Last-Modified versions, 09:59:48, 10:04:49, and 10:04:53 UTC, all with value 4. Cache nodes can return adjacent or older versions; 19 reads are not 19 independent backend calculations. The official account had joined long before this window. There was no pre-entry comparison or per-account backend acceptance receipt.

Live playerlist identities were matched individually against local project accounts. All seven research players had Health 0; all six other players had positive health. Worker metadata also recorded ownPlayerState.lifeState=dead for all seven. Each had sent one respawn. Three had historically completed waking and four had interrupted waking; cumulative Tick counts were 1, 1, 1, 1, 3, 3, 3. These historical events do not establish that the players remained alive. Death also does not prove a Facepunch counting formula.

## What the normal client sent

Approximately one minute of real traffic was captured while the user operated the normal account. pktmon first checked that no capture or filters already existed; afterward it was confirmed stopped and this run's filters were removed. No process injection, game-memory reading, input sending, or input replay was performed.

Offline filtering used RustClient's actual UDP endpoints at capture start/end and the target game address. Exactly one game socket matched, excluding other independent connections on the same computer. Of 96,771 raw packets, 24,166 matched; 12,278 had valid RakNet data layouts and none had invalid layouts.

| Observation | Real official client | Independent program at that time |
| --- | --- | --- |
| PlayerTick | 1,082 deduplicated frames spanning 60.640 seconds | At most one wake cycle, 1–3 frames per connection |
| Input | All 1,082 frames had input; 48 explicitly had buttons, with 47 explicit value changes | Initial neutral→crouch→release; no ongoing game input |
| State fields | Position in 1,074 frames; model and eye position in 1,082 | Restricted stationary pose; no movement/collision/navigation |
| Life state | Positive server health and observed position changes between samples | All seven research connections were dead in this window |
| Maintenance | Official client running the game | Owner keepalive RPC updated timeout state without adding real raw Tick activity |

The existing independent RakNet analyzer also found 1,082 unique reliable unfragmented Ticks, matching the socket-filtered analysis. Mean rate was 17.826 Hz, median interval 66.548 ms, P95 67.145 ms, and maximum 354.224 ms. These describe this capture; they are neither a universal Rust frequency nor a retransmission target.

Field presence does not mean movement occurred in every frame. Omitted ProtoDelta fields are not zero; a complete initial baseline was not reconstructed. Only one additional unique outbound RPC was observed, without claiming a specific gather/attack succeeded. Neighboring server-position changes and the user's description support actual gameplay, but do not establish public-count causation.

## Subsequent changes and the official-client test account

At 10:09:44 UTC, all seven original project connections and the original normal account were absent; the original other five identities remained. The assistant did not stop player connections, sign out Steam, restart the service, or restore these sessions. This bulk departure must be distinguished from a single-account admission.

The user then manually switched and identified a project account already connected through the official client. A read-only check at 10:12:47 UTC precisely matched the current Steam identity to that project account and the server roster: positive health, no independent game session, six actual players, and zero project Rust sessions. Probe reported alive 6, sleeping 0, and rawTickRatePositive 6. ConnectedSeconds suggested entry around 10:11:34 UTC. The first roster sample was 10:12:14, still with Health 0; the first positive-health sample was 10:12:44.

The identity matched one of the initial seven dead research connections, establishing an observed same-account comparison: independent dead connection→user ends it→official client alive gameplay. However, seven other original players also left across the phase change, so total-count changes cannot all be attributed to this account. Another identity briefly joined at 10:13:14 and left at 10:13:44, restoring the other five; public-batch attribution must include this interference.

The user originally planned to play until around 18:25 Beijing time, but was already absent at 10:17:44 UTC and confirmed a voluntary departure. Observed alive play lasted about 4.5 minutes, not the planned 12 minutes. Captured official input had not been converted into independent gameplay implementation; full movement, physics, collision, items, and subsequent normal respawns remained absent.

## Continuation and scope

Read-only drivers and raw material were stored in ignored `work/official-gameplay-20261025-1001/`. Main sampling session 25511 ran every 30 seconds, at most 49 samples, with an expected 10:24:15 UTC completion. Local correlation reader 43879 was to exit after it; continuation 23032 began 10:24:30 for up to 23 departure samples. The official-client report records actual completion. These observation processes are not the project service or player sessions.

The main sampler's official identity stayed fixed to the original normal account. Later analysis must use the exact identity in private `test-admission-private.json`, the private timeline, and original rosters. The correlation reader's `officialProjectIdentityHasPrimaryGameSession` incorrectly used a steamId property absent from overview; it is not evidence. The correct approach obtains the project id from accounts and matches overview.id. This independent check used that method; its result establishes that the official test account had no independent game session.

This batch did not implement EAC, alter public reporting, deploy DLLs, change server settings, or send automated game input. The user's manually operated official client was preserved. No assistant-created player connection required cleanup. New captures and observations were to be frozen after completion; files still growing were not assigned fixed hashes prematurely.
