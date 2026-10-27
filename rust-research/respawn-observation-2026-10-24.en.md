# Finite observation of normal self-respawn — 2026-10-24

English edition of the [original report](respawn-observation-2026-10-24.md). A single account attempted normal self-respawn once and was subsequently observed alive. Facepunch's public trusted count later changed 8 → 9 and returned to 8 after scheduled disconnection. Another ordinary player briefly left during the window, so this timing association does not establish a public-list fix or individual-account acceptance.

All finite windows ended and their sources were fixed for offline review. Times are UTC. No RustClient process or manually refreshed game-list reading was available. Values below came from the public interface; the analyzed client formula `max(0,min(cp,trusted))` supports a display prediction only. See the [client count review](player-count-update-2026-10-24.en.md).

## Action and verification boundaries

In the analyzed server, `global.respawn` is a ServerUser command that obtains the caller's own character from the authenticated connection. It checks dead/spectator state and cooldown, then follows `Respawn → FindSpawnPoint → RespawnAt` with a five-second cooldown.

The optional `respawnOnDead` setting is a strict Boolean and defaults to false. At most one fixed `respawn` is attempted per connection, after identity, Ready, supported encryption, exact own entity/FinishLoading matching and a dead full snapshot no older than ten seconds. Native send failure is not retried. This feature did not send wake, PlayerTick or movement. An alive snapshot after sending is an observation, not a server command acknowledgment or proof of sole causation.

The local attempt from 06:13:13.894 to 06:13:18.933 stopped at `protected_or_unsupported_encryption_required`. No respawn was attempted or sent, no own entity/FinishLoading was observed, the ticket became inactive, and `stopRequired=false`. This validated protection and cleanup behavior rather than local respawn success; security configuration was not changed.

## Remote connection window

The remote window ran from 06:13:31.508 to 06:24:37.417, with 129 session samples and 22 public queries. The first `entered_game` and alive sample was 06:13:38.026. One command was recorded as sent. `respawnAliveAfterSeconds=0.031` is a local send-to-receive interval, not server execution time or round-trip latency.

At closure the session's elapsed time was 663.734 seconds. Its last own snapshot was alive, sleeping and health-positive, but 660.109 seconds old. Retained snapshots are not current online evidence. Alive-and-sleeping is also distinct from normal wake completion.

A separate read-only `global.playerlist` response at 06:19:54.003 uniquely matched the account and returned positive current server health and 380 connected seconds. That result did not include sleep/life state or EAC qualification. Twenty read-only RCON samples observed total population 8/9/10, research population 0/1 and other population 8/9. At normal cleanup the client was closed, the ticket inactive and `stopRequired=false`.

| Public `Last-Modified` batch, UTC | Trusted count | Samples |
| --- | ---: | ---: |
| 06:11:33 | 8 | 6 |
| 06:16:32 | 8 | 10 |
| 06:21:33 | 9 | 6 |

The 06:21:33 batch was first observed at 06:21:47.554. The nearby RCON sample had total 10, research 1 and other 9. Fifteen roster samples from 06:14:53.693 through 06:22:11.724 matched the same nine other identities; one left at 06:22:43.000, after the increase batch but before research-account cleanup. This supports an early timing association while leaving later decline confounded.

Offline comparison across the preceding, connected and disconnected windows covered 84 identity-set comparisons, with 57 matching the baseline. Sampling cannot exclude changes between observations or changes in the same player's eligibility. Only comparison Booleans and added/removed counts were retained, not identities or identity hashes.

## Post-disconnection windows

The first post-disconnection window ran from 06:24:37.575 to 06:35:36.010 with 22 samples. A separate 11-sample extension ended at 06:40:52.255 to cover a delay comparable to the earlier increase. No account was reconnected and no configuration changed for the extension.

| Public batch, UTC | Trusted count | Samples in first post window |
| --- | ---: | ---: |
| 06:21:33 | 9 | 4 |
| 06:26:33 | 9 | 10 |
| 06:31:34 | 8 | 8 |

The decline was first observed at 06:31:56.390, 438.973 seconds after cleanup. The same RCON observation had research 0 and other 9 with no adjacent other-set change. However, the earlier ordinary-player departure and unknown backend eligibility/delay still prevent a unique causal conclusion.

The extension saw two samples of the 06:31:34 count-8 batch and nine of the 06:36:34 count-8 batch. All 33 post-disconnection observations confirmed the research account absent, its session closed and its ticket inactive. This was a completed finite experiment.

The report's historical next step was a separate second-account replication, subsequently recorded in the [repeat report](respawn-repeat-observation-2026-10-24.en.md). Neither this timing association nor Steam ticket validation proves a valid EAC session. Raw RCON replies, identities and credentials remain ignored; [sanitized evidence](respawn-observation-2026-10-24.json) preserves diagnostics and source hashes.
