# PlayerCountProbe 0.1.0

[English](PlayerCountProbe.en.md) · [简体中文](PlayerCountProbe.md)

The goal is to compare normal server state for selected research accounts and other connections on an actually registered server, investigating why world admission and public-list population differ. It is a read-only diagnostic, not a population fix.

## First deployment

Upload `PlayerCountProbe.cs` with its exact filename to the target's `oxide/plugins/`. Oxide normally compiles/loads it without a restart. Upload only this file initially; do not install candidate Harmony DLLs, change secure/analytics settings, or alter ordinary player connections for this first stage.

Read over existing RCON:

```text
playercountprobe.snapshot
```

Require `version=0.1.0`, `monitoring=true`, `sample.status=sampled`, and read the three runtime module MVIDs. File presence, compilation success, or a command name alone is not a valid runtime snapshot. Retain actual compilation errors rather than bypassing missing APIs or permissions.

The management program reads research identities from existing private account information and configures an in-memory group over existing private RCON. The command is `playercountprobe.focus` with up to 20 unique 17-digit decimal Steam identities, each as its own argument. `playercountprobe.focus clear` returns to unclassified mode. Focus configuration is RCON-only; its response contains only count/new-window time. Do not put actual arguments in public reports, Git, or screenshots.

The plugin writes no identities to files and does not echo arguments, but RCON audit, panel history, or external tools may record the command; it cannot promise those systems hold no records. Focus changes create a new statistics window without mixing old in-flight callbacks. Steam service connect/disconnect counts cover the whole plugin lifetime.

## Content and interpretation

Normal main-thread sampling runs every five seconds, and snapshot triggers a fresh sample. Results separate `focused`, `other`, and `unclassified`:

| Content | Meaning/limit |
| --- | --- |
| active/alive/dead/sleeping/connected/receivingSnapshot | Actual active-list state totals |
| networkEntries/networkConnected/networkAuthenticated | Network-collection totals, with a denominator distinct from the active list |
| Steam validation OK/NonOK callbacks and times | Real public events in this window; NonOK includes cancellation/later invalidation, not just rejected admission; earlier events are not reconstructed |
| effectiveSecure/effectiveEncryption | Actual runtime fields, not inferred configuration integers |
| steamInterfaceValid/steamLoggedOn | Interface presence and backend login |
| eacInterfaceAvailable/eacMapped/eacStatusAuthenticated | Interface, nonzero handle, and cached status respectively; none alone proves valid protection or final EOS-token success |
| rawTickRatePositive | Active entries whose original cached `rawTickCount` rate is positive, not cumulative packets, valid inputs, or eligibility |
| inputHookCalls/inputHookObserved | Observed optional OnPlayerInput calls; zero/false can mean no framework dispatch and does not prove the client sent no input |

Without focus, all objects/callbacks are unclassified. Other means unmatched against selected accounts, **not automatically a human**. The identity also does not identify which kind of client used the account at that time; use controlled connection timing.

The plugin reads/outputs no input contents, positions, names, tickets, administrator credentials, or callback user/owner identities. The optional input hook is a void observation and does not intercept handling. Steam callbacks only classify in memory and update atomic counters, without Unity access; game collections are sampled through normal main-thread framework scheduling. Fixed error categories replace original exceptions. A failed sample replaces an older successful snapshot with a new failure state.

Counters are read independently, not transactionally; concurrent callbacks can temporarily make validations differ from OK+NonOK. Collection availability has separate flags: unreadable does not mean zero players.

## Cleanup and validation state

```text
oxide.unload PlayerCountProbe
```

Unload removes subscriptions, destroys the timer, and clears current in-memory focus. Move the uploaded source out afterwards if not needed, to prevent startup loading. Do not delete other plugins.

The source passed offline compilation against real local server/Oxide references, separate static review, and same-source stub isolation: 13 groups, 339 assertions, including 38 response-privacy checks. **It had not been loaded on the target: actual hook delivery, remote compatibility, and public-count effects remained unverified.** Build with `Build-PlayerCountProbe.ps1`; evidence is `rust-research/playercount-probe-preparation-2026-10-24.json`.
