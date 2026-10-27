# Official client: same-account gameplay and public-count comparison

Historical record, 2026-10-25. Times are Beijing time unless marked UTC. **The public count changed 4→5→4, but this does not establish that the test account was counted.** The same other player joined and left twice, finally leaving in the same sampling window as the test account. There was no comparison in which only the test account changed. The independent-program public-count problem remained unresolved.

The user also authorized fully automated client operation, but the Windows control component was unavailable and that automated comparison did not run. The official gameplay below was performed personally by the user.

## Completed comparison

| Phase | Server observation | Facepunch public value |
| --- | --- | --- |
| Original normal-account baseline | Actual/cp 13; all seven project connections Health 0, six others alive | 4 |
| Original seven and normal account departed | Same other five identities; project Rust activity 0 | 4 |
| Same project account playing through official client | Six players, temporarily seven with another join; positive health and position changes | 4→5 |
| After voluntary departure | Test account absent, original other five restored | 5→4 |

Local project records, the active Steam identity, and the target roster precisely matched the user-designated account, one of the original seven dead connections. At 10:12:47 UTC it had no independent game session, correctly checked by obtaining the project id from accounts and matching overview.id. Its tickets were neither read nor replayed.

The first roster sample 18:12:14 had Health 0; the first alive sample was 18:12:44, the last presence 18:17:14, and first absence 18:17:44. The user confirmed normal disconnection. Observed alive span was 270.056 seconds:10 positive-health samples and 8 neighboring position changes. The planned 12-minute gameplay period was not completed and must not be reported as observed duration.

## Normal actions versus the independent program

Over approximately 91.009 seconds of outbound official-client traffic while the user operated the test account:

- 2,631 deduplicated PlayerTicks, all with input; 86 explicitly contained buttons and 85 explicit button-value changes.
- Position appeared in 1,201 frames, modelState in 2,631, and eyePos in 1,287. Presence does not mean movement in every frame.
- 31 unique unfragmented outbound RPCs; their count did not identify successful gathering or attacks.

The other normal account's baseline contained 1,082 Ticks and 47 explicit button changes. Both captures were filtered by actual RustClient UDP endpoints and target game address, matching exactly one game socket and excluding independent connections. Existing independent RakNet Tick counts agreed; the test capture had 0 parsing failures. Omitted ProtoDelta fields were not treated as zero, no complete state was reconstructed from a mid-session capture, and no actions were replayed.

The independent implementation then had only one bounded wake cycle per connection, totaling 1–3 Ticks. Subsequent owner keepalive updated connection timeout state. All initial seven accounts had requested one respawn, three historically woke, and all seven later died, supported by Health 0 and worker dead state. **Historical waking and maintained connections are not sustained survival, movement, or interaction.** Full movement physics, collision, interaction, and repeated normal respawn were still missing.

## Why attribution remains unresolved

Another identity joined 18:13:14 and departed 18:13:44, then rejoined 18:15:44 and departed 18:17:44, the last departure sharing the test account's window. The raw identity stayed in ignored evidence and is associated by an anonymous alias in the report. The additional public player could relate to either player, changing eligibility of existing players, or backend delay. No per-account acceptance receipt was available.

The new 18:20:02 public version was still 5; only 18:24:57 dropped to 4. There were 62 samples, 0 source failures, and 765.41 seconds of post-departure observation, ending 18:30:30. New HTTP reads and repeated versions are not independent backend calculations.

| Public Last-Modified | Count | First actually read |
| --- | ---: | --- |
|17:59:48|4|18:00:15|
|18:04:49|4|18:05:15|
|18:04:53|4|18:06:46|
|18:09:52|4|18:10:16|
|18:09:59|4|18:14:46|
|18:14:54|5|18:15:16|
|18:15:03|5|18:15:46|
|18:20:02|5|18:20:15|
|18:24:57|4|18:25:01|
|18:30:00|4|18:30:01|

Both connection types used the same target permitting non-EAC, unencrypted connections. This does not validate an EAC-protected session or extend to other security configurations. Public counts and cp were not rewritten; no count DLL was deployed.

## Automated-client blocker

User authorization to connect, disconnect, and operate the game automatically remained valid. After reading computer-use SKILL/guidance/api/confirmations, initialization and window enumeration failed; a retry after 2 seconds and a further retry after resetting the JavaScript kernel also failed, all before choosing a target window:

`Computer Use native pipe is unavailable: failed to connect native pipe: the system cannot find the specified file. (os error 2)`

Actual assistant input:0 keyboard events, 0 mouse events, 0 new game connections. Following the skill's recovery guidance, GUI attempts stopped. No unknown helper was launched, custom control protocol built, PowerShell UI automation substituted, or security settings bypassed. This explains the incomplete automated comparison; user-operated gameplay must not be represented as automated work.

The OpenAI Docs skill was also used for official-domain lookup and reading. The developer troubleshooting page returned 403; a subsequent search/read failed. No verified native-pipe recovery procedure was obtained. Unverified restart advice was not presented as a fix and access failures were not bypassed.

After control recovery, the existing authorization and test account could support a new single-account entry→normal official gameplay→normal departure comparison, first stabilizing the other roster and recording public publication cycles and natural arrivals/departures. While unavailable, the assistant cannot claim to perform keyboard/mouse operations.

## Evidence and closure

[The same-name JSON](official-client-gameplay-control-2026-10-25.json) contains normalized per-sample results, exact roster-set changes, cache information, real capture summaries, and 149 evidence hashes. Raw accounts, identities, coordinates, and authentication-related records stayed in ignored `work/official-gameplay-20261025-1001/`.

Main sampling completed 49 samples. The continuation completed 13, covering three new post-departure versions, then was intentionally ended. Windows interruption prevented its finally block; the original safe file was preserved and a separate stop record confirmed the process absent. It must not be described as naturally completing 23 samples. No assistant-created player connection or configuration required rollback.

All game input came from the user. The assistant neither created/stopped player sessions nor changed server settings, restarted the project, loaded DLLs, or sent automated input. Both pktmon captures stopped and an independent check found no filters. No verified independent-program public-count fix resulted.
