# Genuine game-server identity association: implementation and three-stage test

Historical experiment: 2026-10-25. [Original](presence-association-experiment-2026-10-25.md); [source/evidence hashes](presence-association-experiment-2026-10-25.json). Strict verifier-to-target association was implemented/tested, but no public-count increase was observed. The candidate was not enabled in normal service/UI and no count DLL was deployed.

Existing independent activity already had real Rust AppID, IP and game port. The optional `steam_id_gs` candidate matches the exclusive ticket's AppID, CRC, GC token, account, Steam connection object and lease generation. Its successful verifier identity must equal a fresh exact-target A2S server identity, and the same game session must already be admitted, before constructing exact uint64-string activity. Ticket cancel, mismatch or generation change invalidates it. The module only observes/constructs; the experiment driver sends. 46 Node tests passed, including six new groups for matching, gates, cross-target rejection, generations, precision and listener cleanup; none is backend evidence.

One saved-login account originally in the main manager's Steam-error state and without a game session was used in one isolated normal Steam login/Rust admission. Other accounts, the main service and seven existing games were untouched.

| Stage | Duration/samples | Real roster | cp | Public |
| --- | --- | --- | --- | --- |
|control|6min/6|14|13, 14|3, 4|
|associated|11min/11|14|14|3|
|restored|6min/6|14, 15|14, 15|3, 4|

Control used existing real app/IP/port, associated added the matched genuine server identity, and restored removed it. One game connection persisted throughout, without Tick, wake, respawn or server settings changes. In all eleven associated samples, the account remained in the real roster, ticket readable/active and verifier matched; both research/other identity sets stayed identical. cp/real14 and public3 persisted across later Last-Modified09:04:45 and09:09:46UTC. New headers do not themselves guarantee independent recalculation, but no visible candidate benefit occurred.

Public4→3 began during control, not association. A natural other-player join in restored changed roster15 and a later09:14:48 public batch became4; the association field was already removed and roster unstable, so it cannot count as candidate success or reversal effect. All 23 samples/four sources succeeded; the original seven games retained startedAt, and zero-Tick was individually checked.

An anonymous Steam persona query during associated/restored returned no usable profile. That is unavailable observation, not proof invalid activity; the inspected persona schema also lacks the server SteamID, so it cannot prove field acceptance. Sending/appLaunched is not a backend receipt; playing-block status was not recorded. One account, target and finite cached window cannot establish all association methods ineffective or identify EAC/sleep/Tick as the sole cause. Rewriting already-correctcp14 cannot set the independent public cap.

Finally only this experiment's game was stopped; worker closed, session closed, ticket readable/inactive were confirmed before clearing activity/logging off isolated Steam. An independent check found the test absent, main candidate's original state unchanged, seven games with original startedAt, and service healthy. No connection/configuration debt remained. Private identities/auth context/admin data stay ignored; unknown FakePlayers/services were not run, and no fabricated population/auth/activity event was generated.
