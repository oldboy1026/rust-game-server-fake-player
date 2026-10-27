# Target-server PlayerCountProbe observation — 2026-10-24

English edition of the [original report](playercount-probe-target-2026-10-24.md). Times are UTC. This is a historical experiment, not the current account inventory. All imported accounts were deleted on 2026-10-27.

`PlayerCountProbe.cs` actually loaded on the target server: the first real snapshot at 08:52 returned `monitoring=true` and `status=sampled`; three research accounts were configured as the focus at 08:53. This superseded the earlier [preparation status](playercount-probe-preparation-2026-10-24.en.md). It verified server observations and an input-state difference, but did not fix public server-list population.

## Running configuration and grouping

At 08:52:00.866, all 13 active entries were alive, awake, connected and network authenticated. All had a positive cached raw tick rate; the input hook had observed 16, 473 calls. No focus existed yet, so all entries were unclassified. They cannot retrospectively be labeled research accounts or ordinary human players.

The server reported `effectiveSecure=false`, `effectiveEncryption=0`, a valid and logged-on Steam interface, and no EAC interface. All 13 entries had `eacMapped=false`, while the cached EAC authenticated-status count was 13. That cached status does not establish protected EAC sessions. Zero Steam validation callbacks after the observer loaded does not establish that pre-existing connections had never been validated.

Game, Steamworks and Network module MVIDs matched the analyzed copies. Matching MVIDs do not prove identical runtime patches, native SDKs or backend treatment. The running server actually dispatched input hooks, so a local original-module result with no hook dispatcher cannot explain away its observed input.

The focus epoch began at 08:53:15.572 with three configured accounts, zero active focused accounts and 13 other active entries. The plugin supports at most 20 focus entries. `other` means outside the configured focus, not necessarily a human control group; later research accounts could appear there.

## Sampling gaps and changed experimental conditions

The planned sequence was a 120-second baseline, one account connected for at most 900 seconds, then 600 seconds after disconnection. The connection request began at 09:03:11.027; its 900-second limit was measured from that request, not from confirmed world admission.

| Segment | First–last query start, UTC | Samples | All three sources available | Missing Probe / roster / public query |
| --- | --- | ---: | ---: | --- |
| Initial baseline | 09:01:11–09:02:43 | 4 | 2 | 1 / 2 / 0 |
| Initial connection segment | 09:03:11–09:08:14 | 11 | 0 | 11 / 11 / 0 |
| Recovered connection segment | 09:07:53–09:17:58 | 21 | 11 | 10 / 10 / 0 |
| After disconnection | 09:18:12–09:27:45 | 20 | 20 | 0 / 0 / 0 |

Sources were the Probe, a private RCON roster, and A2S/Facepunch public queries. The two connection segments overlap and are not independent observations. Query start times also do not make the three sources an atomic snapshot.

Roster gaps started at 09:02:12; both Probe and roster were unavailable from 09:02:43 until complete sampling resumed at 09:12:53.855. Recovery retained the original session's exact `startedAt` and 09:18:11 cleanup deadline. It reused one queued persistent WebSocket. Static management-channel limits suggest a possible mechanism for the outage but do not prove rate limiting caused it.

The original nonfocus baseline roster had 13 entries; the first recovered roster had 14, with one additional identity. The recovery driver's `otherMatchesBaseline` was based on a newly established recovery baseline. At 09:15:23, focused presence rose from one to three while the owner also added other research connections. The original controlled single-account design was therefore not completed as planned.

## Observable state difference

Across five complete snapshots from 09:12:53 to 09:14:57, the focused account was active, alive, sleeping, connected and network authenticated. It had `rawTickRatePositive=0` and `inputHookCalls=0`. One Steam validation callback in that epoch returned OK.

| Group and time | Active / sleeping | Entries with positive raw tick rate | Cumulative input-hook calls |
| --- | ---: | ---: | ---: |
| Focused, 09:12:53 | 1 / 1 | 0 | 0 |
| Other, 09:12:53 | 14 / 0 | 14 | 416, 777 |
| Focused, 09:14:57 | 1 / 1 | 0 | 0 |
| Other, 09:14:57 | 14 / 0 | 14 | 461, 404 |

This difference is consistent with the worker's then-existing lack of application-level `PlayerTick` and normal wake behavior. It does not establish that Facepunch uses these fields for public population. Hook calls are not raw packet counts; a positive cached-rate count is not a cumulative packet counter. Compare cumulative callbacks only within the same epoch and avoid attributing later multi-account callbacks to the original account.

The server was nonsecure and lacked an EAC interface while other connections had input and the public trusted count was nonzero. Thus missing current server-side EAC mapping is not a demonstrated sole explanation. This neither establishes valid EAC sessions nor shows that EAC is irrelevant to eligibility.

## Public population and cleanup

Every available public query through 09:28:12 returned trusted population **11**. The baseline, original connection, recovered connection and post-disconnection segments saw 2, 2, 3 and 3 distinct `Last-Modified` times respectively; adjacent segments may share batches. The first complete recovered comparison was roster 15, `cp` 15, A2S 17 and trusted 11. No refreshed Rust client UI reading was obtained; that field remains `null` in the evidence.

A later independent query at 09:37:31 returned A2S 18, `cp` 16 and trusted **10**, with batch time 09:36:59. It is outside the finite window and cannot be attributed to one account or to the then-unexecuted bulk experiment.

The original account stopped normally at 09:18:11, with its client closed and Steam ticket inactive. All 20 subsequent rosters confirmed its absence. The driver completed at 09:28:12.041 with `stopRequired=false`. A historical 09:34:56 summary still showed 39 Steam logins and three owner-retained Rust world connections; these were separate from this experiment's cleanup and are not current account state.

## Connection limit and historical next step

A read-only query at 09:21:34.821 returned `server.maxconnectionsperip=5`. The analyzed path limits simultaneous game connections from one IP, including connections before authentication, and rejects excess connections before `RequestUserInformation`. Different source ports or staggered starts do not raise this simultaneous limit.

The subsequent [worker rejection repair](worker-rejection-fix-2026-10-24.en.md) regression observed one world admission and two correctly classified connection-limit rejections. All three regression sessions were cleaned up. Historical generic exits cannot all be relabeled as confirmed IP-limit rejections.

At the date of this report, a proposal to temporarily raise the global limit from 5 to 50, observe a 20-minute bulk session and restore 5 had not been executed. Later reports must be consulted for later work. Complete roster coverage, precise session ownership, confirmed world-entry times and controlled changes in other players are prerequisites for interpreting any population result.

Evidence: [sanitized JSON](playercount-probe-target-2026-10-24.json). Key SHA-256 values are `793d46e64a3eff5b550dee7d0d816c0ad8439d81da4886564a192a7d049d6bf7` for the recovery window, `7f3461ec8fc77ed015739a3ec073c9ef5f4ab48009242525caf7ec736959974d` for security state, and `311422145a96be5bc2e1ca233a507192690ebf93e31ed9551fc03c457f27f9cb` for the static connection-limit path. Raw rosters, credentials, identities and management envelopes remain in ignored local storage.
