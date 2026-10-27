# Repeated official-client observation of the same account

Historical record, 2026-10-25; all times Beijing time. This read-only observation ended. The user manually reconnected the same target after the previous experiment. No independent-program public-count fix was verified.

Every public value during this round was 3, without an observed change during gameplay or departure. There was no immediate pre-entry public sample, so whether the test account was included remains unknown.

## Starting point and scope

At 18:38:51, a read-only check confirmed that the active Steam identity was still the user-designated project account and was present with positive health. Probe reported 6 active, alive, connected, and rawTickRatePositive players, with 0 sleeping. Independent Rust activity was 0. The other five identities exactly matched the previous final roster. No player connection was created or stopped. ConnectedSeconds suggested entry around 18:38:13.

Formal sampling began at 18:40:07. The first public version, 18:39:56, was 3; 18:40:02 was also 3, while actual/`cp` counts were 6. **Both versions postdate entry and are not pre-entry baselines. The preceding round's 4 cannot replace the missing immediate baseline.**

The plan was user gameplay until after 18:51 and manual departure. The observer detected presence/absence, health, position changes, other-identity sets, and Last-Modified, with a maximum of 61 samples/30 minutes. After departure it could end once at least 12 minutes and 3 new public versions were observed. GUI control still reported native pipe unavailable; the assistant sent no keyboard/mouse input and all gameplay remained manual.

## Observed results

- 51 samples; 0 semantic-source failures.
- 22 samples contained the test account, all 22 with positive health; 15 neighboring position changes.
- Last in-server ConnectedSeconds was 745; positive-health preflight to last presence spanned 707.035 seconds, not a complete continuous action recording.
- Public value while present: 3; after departure: 3.
- All samples retained the same other five identities; 0 identity-set changes.
- First formal presence 18:40:07, last 18:50:38, first absence 18:51:08, final observation 19:05:08.
- Post-departure window: 840.23 seconds, including 3 versions newer than departure.

|Public Last-Modified|Count|First actually read|
|---|---:|---|
|18:39:56|3|18:40:10|
|18:40:02|3|18:40:39|
|18:44:58|3|18:45:09|
|18:50:00|3|18:50:09|
|18:49:57|3|18:51:39|
|18:55:02|3|18:55:10|
|18:59:58|3|19:00:09|
|19:04:59|3|19:05:09|

Versions seconds apart can surround the same refresh; version count is not independent backend-calculation count. Position changes establish different positions between samples, not successful individual gathering or jumping actions. Earlier captures are not direct evidence of this round's ongoing input. Even with unchanged identities, their backend eligibility could change. No per-account Facepunch receipt was available.

Normal-client entry, survival, and movement were confirmed. The hypothesis that adding normal actions causes public counts to increase was not validated. An aggregate of 3 identifies no particular counted account, reveals no backend algorithm, and does not constitute a fix.

Two raw playerlists, one during presence and one after departure, had OwnerSteamID 0/no valid ownership value. These are RCON fields, not license credentials; 0 cannot explain license-sharing deduplication or public counts.

Rechecking every original roster found 0 changes to the other five source IPs and 0 ConnectedSeconds resets. The distinct source IPv4 count was 6 while the test account was present and 5 afterward; it shared no source IP with the others. Public 3 did not equal the source-IP count and cannot be explained solely by this round's same-IP connection count. Stable identity/IP/duration still does not imply stable backend eligibility.

## Additional static classification of the previous round's 31 RPCs

This analysis concerns the previous 18:13–18:14 capture, separately from this round. Only fixed outbound function hashes were read; entity identities and argument bodies were not exported. The same ManifestHash was calculated for 23,895 unique method names in existing server dnlib metadata. All 8 hashes matched RPC_Server names. Current and pre-capture server MVIDs matched that assembly. This was static reading, without executing game assemblies or sending RPCs.

|RPC method|Outbound requests|
|---|---:|
|OnProjectileAttack|1|
|BroadcastSignalFromClient|13|
|OnPlayerLanded|1|
|OnProjectileUpdate|1|
|Pickup|1|
|CLProject|1|
|RequestAnimalStats|6|
|PlayerAttack|7|

The total of 31 agrees with the previous independent analyzer. Pickup can belong to several entity types; CLProject and RequestAnimalStats also have multiple candidate declaring types. Hashes did not identify specific target entities or prove handler success. These attack/pickup requests, landing notifications, animation signals, and state queries show additional normal-client flows, without evidence that they are public-count eligibility conditions.

## Evidence and closure

Raw rosters, account bindings, and coordinates remain in ignored `work/official-repeat-20261025T103850Z/`. [The same-name JSON](official-client-gameplay-repeat-2026-10-25.json) contains complete sanitized samples and 125 hashes. The read-only observer supports `stop-request.json` for stopping itself; it does not sign out the user, modify the server, or restart the project.

A separate final check at 19:06:39 found service health true, Steam 38/39 online, independent Rust activity 0 with states matching the last sample, the test account absent, and continuity of the other five identities, addresses, and durations. Ended user connections were not restored; no player cleanup or configuration rollback was required.

The main observer naturally exited with code 0. The final single read-only checker remained running after saving successful evidence; at 19:08:30, its precise process identity was verified and it was externally terminated. Remaining matching processes: 0. That checker did not exit naturally, and the project service was not terminated.

Final status: ended at 19:05:09, reason `post_departure_window_complete`. The control error remained `Computer Use native pipe is unavailable (os error 2)`. Prior user authorization remained valid; tool unavailability was not missing permission and did not mean automated gameplay had occurred.
