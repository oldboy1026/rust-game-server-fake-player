# Resumed observation: dead own entities and connection loss — 2026-10-24

English edition of the [original report](resume-own-state-2026-10-24.md). Three research accounts completed the existing admission checks, but their complete own-entity snapshots were dead and all three connections later failed. This experiment did not fix Rust's public list population. Retained entity snapshots must not be described as current online sessions.

The read-only sampling window ran from 05:51:50.469 to 06:07:37.710 UTC. It contained 31 observations, 30 usable RCON responses, one whole-observation failure, one A2S timeout and one trusted-service network failure. Separate main-task actions restored the three connections; report preparation itself ran no new experiment. Account labels 1–3 are observation indices, not published identities.

## Observations

- At 05:56:13.173 all three sessions were `entered_game`, matched their own entity and observed exact `FinishLoading`. Steam tickets were active and recipient validation had been observed. Each account had three own snapshots with `lifeState=dead`, `sleeping=false`, `connectedFlag=true` and `receivingSnapshot=true`.
- Dead state differs from sleeping state. In the analyzed lifecycle, `BaseCombatEntity.Die` sets health to zero and life state to Dead; `BasePlayer.OnDied` calls `EndSleeping`. Thus a dead character can normally have `sleeping=false`. This does not prove death caused public-count exclusion. `healthPositive=null` means no explicit health field was observed.
- At 05:56:00.934, 05:56:32.205 and 05:57:03.508, RCON showed total 11, research 3 and other 8; A2S was 14. `cp` changed from 8 to 11, while the new 05:56:31 public batch remained trusted 7. The short window cannot establish permanent exclusion.
- At 05:57:34.799, research presence was zero and all three sessions were stopping. A separate 05:59:22.801 snapshot showed all three in error with `transport_connection_lost`, durations 106.484 / 101.469 / 96.437 seconds, and inactive tickets.
- Other population later changed from 8 to 9 without identity-set comparison. The 06:06:32 public batch increased trusted population from 7 to 8, first observed at 06:06:34.849, after the research accounts had left. That is not evidence of their acceptance.

## Interpretation and next step

The records justify life-state diagnostics but do not explain connection loss or establish a causal relationship between death and trusted population. Steam ticket validation, RCON state, A2S, `cp`, Facepunch population and valid EAC sessions are separate evidence categories. No valid EAC-protected session was verified here.

`receivingSnapshot=true` came from the last complete own snapshot; with no later update it does not prove loading remained in progress. API, RCON, A2S and public queries also ran seconds apart rather than atomically. `entityParseFailures` counts failures across all entities, not just the own entity.

The historical next step was normal self-respawn and stability testing, followed by a finite alive-state comparison across several newly published batches. See the later [respawn observation](respawn-observation-2026-10-24.en.md). Sending a command or exposing a diagnostic field alone is not a list-population fix.

The [evidence JSON](resume-own-state-2026-10-24.json) contains per-sample sanitized values, source SHA-256 values and independent session snapshots. The [original report](resume-own-state-2026-10-24.md) also preserves the complete 31-row count table. Raw identities, RCON replies, credentials and lifecycle excerpts remain in ignored local storage.
