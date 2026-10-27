# ReportingDiagnostics 0.1.0

[English](ReportingDiagnostics.en.md) · [简体中文](ReportingDiagnostics.md)

An inspectable read-only server-diagnostic baseline, implemented in `ReportingDiagnostics.cs` independently of `CountDiagnostics.cs`. **The recorded version was only compiled offline and tested in isolation; it was not installed on a server or run with real Oxide/Steam.**

After `OnServerInitialized`, it subscribes to genuine Steam validation and server connected/disconnected events. Every five seconds it samples active-player totals, Steam interface state, and `cp` from the managed tag cache. It retains no callback user/owner IDs, emits no complete tags, names, IPs, tickets, or coordinates, and does not automatically write logs.

Administrators, RCON, and the local server console can request:

```text
reportdiag.snapshot
```

The command returns the latest sample and aggregate counters. It triggers no publication, player-information resend, Flush, authentication, or experiment. There are no configuration options, and it sets no game population or EAC state. Unload removes all three subscriptions and destroys the timer.

Interpretation:

- Validation counts are received callbacks since loading, not unique accounts. NonOk includes ordinary ticket cancellation and later invalidation, not merely rejected admission. Independently read atomic counters are not a transactional snapshot under concurrency.
- `cachedCp` is the managed Steam-wrapper cache, not external A2S or public accepted population. `observedCpChanges` increases only when consecutive valid samples differ. An ordinary publication every 30 seconds may leave a stable count unchanged; count-change intervals do not reveal publication-call frequency.
- `cachedCpMatchesActive: null` means insufficient valid data. Separate counters represent unavailable Steam interfaces, missing/invalid tags, and sample exceptions. A gap resets the comparison baseline.
- Validation events before loading are not reconstructed. `SteamServer.LoggedOn`, active-list counts, and `cp` cannot replace final EAC authentication or prove public acceptance.
- This baseline does not intercept `BUpdateUserData`. Its actual boolean return remains a separate evidence gap; an unverified Harmony patch is not included.

Offline build/isolated evidence is in `rust-research/reporting-diagnostics-build-2026-10-24.json`. Isolated tests use blank framework/Steam stubs and check this source's permissions, aggregation, `cp` parsing, and subscription cleanup without game DLL execution or networking. Compilation checks syntax/API compatibility with local references, not the target server's actual Oxide/assembly compatibility.

The 2026-10-24 same-source isolated run passed 11 groups and 96 assertions, including 1,000 concurrent validation callbacks, comparison-baseline handling after missing/unavailable/error states, suppression of exception text/full tags, and repeated initialization/unload cleanup. These checks do not establish real Steam delivery, real Oxide scheduling, or public-list inclusion.
