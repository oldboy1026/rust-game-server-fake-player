# Second-account respawn comparison — 2026-10-24

English edition of the [original report](respawn-repeat-observation-2026-10-24.md). This independent repetition observed trusted population 8 → 7, not a reproduction of the first experiment's 8 → 9 → 8. Other-player identity sets changed repeatedly. The result does not determine whether the research account was counted and does not establish a public-list fix.

All finite windows ended; sources and comparison results were fixed by hash. Times are UTC. The account stayed approximately eleven minutes, then 33 read-only samples covered about seventeen minutes after normal disconnection. No automatic reconnection or manual game-list UI reading was part of this report.

## Connected phase

The window began at 06:42:48.447 and contained 128 session samples through 06:53:45.312. First world admission and alive observation occurred at 06:42:55.427. One respawn was sent and a matching alive snapshot followed. That is not a command acknowledgment or sole-cause proof. No conclusion about normal wake, Tick or movement follows from an alive sleeping snapshot.

At closure the session elapsed time was 660.297 seconds; its last own snapshot was alive, sleeping and health-positive but 652.891 seconds old. Twenty-three RCON samples saw other-player population 8 or 9. The first change from the nine-player baseline occurred at 06:48:34.743.

| Public `Last-Modified` batch, UTC | Trusted count | Samples |
| --- | ---: | ---: |
| 06:41:35 | 8 | 8 |
| 06:46:36 | 8 | 10 |
| 06:51:37 | 8 | 4 |

No new batch exceeded the window's baseline. The connection ended normally at 06:53:51.334 with `stopRequired=false`, a closed session and an inactive ticket. Population changes among other players prevent interpreting the unchanged trusted total as direct evidence of exclusion.

## Read-only phase after disconnection

The post window ran from 06:54:20.317 to 07:11:03.166.

| Public batch, UTC | Trusted count | Samples |
| --- | ---: | ---: |
| 06:51:37 | 8 | 5 |
| 06:56:37 | 8 | 9 |
| 07:01:39 | 8 | 10 |
| 07:06:39 | 7 | 9 |

The decline to 7 was first observed at 07:06:52.285, 780.951 seconds after cleanup. Its RCON sample showed research 0, other 8 and an altered other-player identity set. It cannot be attributed solely to the research account leaving.

All 33 post-window RCON samples were available and none found the research account. Every session observation was closed and every ticket inactive. The cycle ended at 07:11:03.172 with all three drivers complete.

## Identity-set controls and limits

Eleven samples from 06:42:50.540 to 06:48:03.457 matched the same nine-player other set. At 06:48:34.743 one identity left before the second new connected-phase public batch. The separate identity-comparison source contains 56 comparisons and no identity values or identity hashes.

| UTC | Phase | Other players | Added since previous | Removed since previous | Same as first eight-player set |
| --- | --- | ---: | ---: | ---: | --- |
| 06:48:34.743 | Connected | 8 | 0 | 1 | Yes |
| 06:57:28.180 | Disconnected | 9 | 1 | 0 | No |
| 07:00:04.637 | Disconnected | 8 | 0 | 1 | No |

Eighteen comparisons matched the first eight-player set, and three adjacent set changes were observed. Equal totals do not establish equal identities. Even controlled positive/negative timing changes would remain distinct from individual eligibility, an actual Rust UI reading or valid EAC authentication. The [sanitized JSON](respawn-repeat-observation-2026-10-24.json) retains states, counts, comparisons and source hashes; private replies and credentials remain ignored.
