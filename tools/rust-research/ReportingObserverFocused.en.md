# ReportingObserverFocused: Second-Stage Read-Only Return Observation

[English](ReportingObserverFocused.en.md) · [简体中文](ReportingObserverFocused.md)

This separate custom Harmony candidate classifies normal `BUpdateUserData` returns by selected accounts, addressing the older observer's aggregate-only attribution gap. It resends no information, does not invoke the original method itself, and changes no arguments, returns, authentication, or counts.

**First stage: upload only PlayerCountProbe.cs.** Obtain a genuine target runtime snapshot and module/framework information before deciding whether this candidate applies. It was not loaded on the target or in Rust Mono. Equal MVIDs do not prove equal whole-file SHA hashes or identical binaries.

Offline build:

```powershell
./tools/rust-research/Build-ReportingObserverFocused.ps1 -ServerDirectory '<your-server-directory>'
```

The candidate checks the exact Steamworks MVID, SteamId type/Value field, and managed signature. It refuses any existing Harmony patch chain and installs only its own by-value postfix. Incompatible or already patched runtimes return a refusal; no override is attempted.

Classification configuration is read once from fixed `HarmonyMods/ReportingObserverFocused-private.json`: an object containing only a `researchIds` string array. Generate it from existing private account information. The file is limited to 4,096 bytes and 20 unique 17-digit decimal identities. Do not put actual identities in Git, public docs, or logs. Missing, empty, or invalid configuration explicitly produces `unclassified`; that does not mean `other`, and `other` does not automatically mean a human player.

Fixed `HarmonyMods/ReportingObserverFocused-state.json` contains only time, status, and aggregate total/classification counters, with no identities, names, tickets, or parameters. `calls/accepted/rejected` represent observed normal returns. `skippedOriginal` separately records a later patch skipping the original; original exceptions remain unchanged. These counts prove neither absence of exceptions nor final admission, HTTP backend acceptance, or public/trusted-list inclusion.

The postfix checks a 180-second monotonic deadline. On expiry it clears matching identity arrays and stops counting, but **does not automatically remove its patch**. Use official `harmony.unload ReportingObserverFocused`, wait for the same `startedUtc` with `unloaded=true/patchInstalled=false`, then hash-check and remove the copied DLL/private configuration. Official load is `harmony.load ReportingObserverFocused`. Unload does not release the AppDomain assembly; do not reload until the asynchronous final write is complete.

The source compiled against real local references. Same-source isolation under official Harmony 2.3.1.1/Windows CLR4 passed 11 groups and 219 assertions: 25 invalid configuration cases, 600 concurrent calls, original results/exceptions unchanged, deadline behavior, and exact removal preserving a third-party patch. The isolated target was a toy method. Real game-target discovery, Rust Mono hot loading, a full 180-second wall-clock run, and public-count effects remained unverified. The old ReportingObserver source/history was not rewritten.
