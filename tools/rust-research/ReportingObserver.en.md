# ReportingObserver 0.1.0

[English](ReportingObserver.en.md) · [简体中文](ReportingObserver.md)

A bounded passive diagnostic DLL for Rust's built-in Harmony loader. It observes only the normal return of the managed `BUpdateUserData` wrapper, without resending requests or creating players, counts, authentication, or analytics events. A true return proves only that this method returned true, not final EAC authentication, admission, or public acceptance.

Unlike the Oxide entry point of `ReportingDiagnostics.cs`, this source implements official `IHarmonyModHooks`. It references the server's own files; no replacement game DLL or separate Harmony distribution is required.

## Build

From the repository root, using an existing stable .NET SDK:

```powershell
./tools/rust-research/Build-ReportingObserver.ps1 -ServerDirectory '<your-server-root>'
```

The build reads only reference metadata. Products and build records default to ignored `work/reporting-observer-build`. The source fixes the inspected Steamworks MVID and exact method signature; a different build is rejected. Do not remove validation and assume wider compatibility.

## Bounded diagnostic contract

After review and validation against the actual server build, place the DLL in the server-root `HarmonyMods` and use ordinary administrator commands:

```text
harmony.load ReportingObserver
harmony.unload ReportingObserver
```

There are no automatic patch attributes. Load checks the exact target and existing patch chain, refusing a preexisting patch. It installs only a void postfix receiving `__result` and `__runOriginal` by value, without user/name/score arguments. Skipped originals have their own counter; an original exception is not converted into a false result. Unload removes only this exact postfix and checks for leftovers.

`HarmonyMods/ReportingObserver-state.json` contains fixed statuses, times, and aggregate counts, updated by a background writer every second. It contains no raw exception or authentication material. `calls/accepted/rejected` count callbacks, not unique accounts, and concurrent counter reads are not transactional.

Observation lasts at most 180 seconds by a monotonic deadline checked inside the postfix, independent of write delays. Expiry stops counting and periodic writes but **still requires explicit unload**. Self-check cleanup is complete only when the matching `startedUtc` file reports `unloaded=true` and `patchInstalled=false`. Do not reload rapidly: an old assembly's asynchronous final snapshot can overwrite the new file.

Unload does not block the game thread waiting for disk; the final snapshot is serialized/written in the background. The loader retains the loaded assembly, while normal unload removes its patch and timer. Move the experiment's DLL out afterwards to prevent startup scanning.

Hot loading may miss already compiled/inlined callers. An installed patch with zero calls is not evidence of reporting failure: genuine normal flows must run, and the patch chain must remain free of unexpected additions. CLR4 isolated validation and actual server Mono evidence are different environments.

Separate dated reports record compilation, isolated checks, and actual local runs. The commands themselves do not demonstrate deployment or a population fix. An unknown `FakePlayers.dll` is not part of this tool and does not belong in this experiment's load directory.
