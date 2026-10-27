# ObserverStateBridge 0.1.0

[English](ObserverStateBridge.en.md) · [简体中文](ObserverStateBridge.md)

An independent read-only Oxide bridge that lets an existing RCON channel read aggregate state from the custom `ReportingObserverFocused`. It is not a population fix, creates no player/authentication events, and installs no Harmony patch.

It is separate from `PlayerCountProbe`. Adding/removing the bridge does not require replacing Probe source and does not actively reset Probe focus windows, subscriptions, or counters. This bridge has no sampling timer or game-event hook.

## Build and validation scope

From the repository root with an existing stable .NET SDK:

```powershell
./tools/rust-research/Build-ObserverStateBridge.ps1 -ServerDirectory '<your-server-root>'
```

The build reads reference metadata only. Outputs, logs, and input hashes default to ignored `work/observer-state-bridge-build/`. Repository-relative paths avoid depending on the original computer's directory.

The source compiled offline against current local server/Oxide references. The same source passed **5 groups and 65 assertions** on CLR4 with independent stubs, covering 25 invalid schemas, RCON permission/no-argument/rate limits, stale/future files, read limits, and compatibility with the observer's output. Tests loaded no game assemblies, connected to no server, and deployed no plugin. They do not replace actual Oxide dispatch, remote serialization, or disk-delay validation.

## Read command

After review, place the unchanged filename `ObserverStateBridge.cs` in the target's `oxide/plugins/`, letting ordinary Oxide compile/load it. Filename, plugin class, and unload name are all `ObserverStateBridge`; these instructions are not proof of deployment.

Use the existing RCON:

```text
observerstatebridge.snapshot
```

The command requires `arg.IsRcon` and accepts no arguments; even in-game administrators cannot use it to read a file. Each plugin instance permits at most one call per second by monotonic time. Permission, argument, and rate errors return fixed categories without echoing arguments.

## Fixed file and schema

The server root is derived only from its current `UnityEngine.Application.dataPath`. The fixed file is:

```text
HarmonyMods/ReportingObserverFocused-state.json
```

The bridge reads neither private focus configuration, older observer files, nor caller-selected paths. It writes nothing and does not reflectively execute assemblies. It checks normal-file/reparse-point properties of the file and HarmonyMods directory and reads at most 4,097 bytes, rejecting anything over **4,096 bytes**. These checks cannot prevent a concurrent administrator replacing a link; a byte limit also does not bound pathological/network-filesystem access latency.

Only producer **0.1.0's exact fields and order** are accepted. The return object is reconstructed, never a raw JSON passthrough. Unknown, duplicate, extra, missing, reordered fields, unexpected types/escapes, trailing content, or invalid UTF-8 reject the entire file.

| Content | Constraint/meaning |
| --- | --- |
| version, windowSeconds | Fixed `0.1.0` and `180` |
| startedUtc, observedUtc | Exact UTC format: window start and state-write time |
| status, focusStatus | Fixed producer enums only, no arbitrary strings |
| focusIdCount | 0-20, consistent with focusStatus; no account identities returned |
| patchInstalled, unloaded | Producer booleans; the bridge does not independently inspect/change patches |
| total, research, other, unclassified | Each has calls, accepted, rejected, skippedOriginal; counts of calls, not unique players |
| writeErrors | Producer's recorded disk-write errors |

Counters must be integers from 0 through 1,000,000,000. Each group requires `calls=accepted+rejected`; classified sums must equal total in every field. Without a valid focus, research/other calls cannot be claimed. The ceiling also rejects a 17-digit identity disguised as a count.

Refusal returns fixed categories such as `observer_state_missing`, `observer_state_not_regular`, `observer_state_oversized`, `observer_state_invalid_schema`, or `observer_state_read_failed`, without paths, raw exceptions, or content snippets. Success returns only the validated aggregate object, without identities, names, tickets, or keys.

## Stale files and interpretation

A successful response includes `retrievedUtc`, `snapshotAgeSeconds`, and `observedWithin15Seconds`. `observer_state_available` means a schema-valid file was read, not that the observer is still running. Future timestamps produce negative age and a false recent flag; old files may still be returned as historical evidence.

Match `startedUtc` to the intended experiment window, then inspect observedUtc, age, status, patchInstalled, and unloaded. Do not treat a file from a previous load as a current sample. The bridge verifies no file signature; a server administrator can replace the file.

Research/other are only the observer's configured in-memory classes; other does not necessarily mean human. A true original return, unloaded patch, or fresh file alone proves neither final EAC, world admission, backend acceptance, nor public population inclusion. The bridge has no Steamworks method-summary fingerprint command; equal MVIDs do not mean equal binary SHA or all code.

## Cleanup

Unload independently when finished:

```text
oxide.unload ObserverStateBridge
```

If no longer needed, move this instance's `ObserverStateBridge.cs` out of `oxide/plugins/` to prevent loading on restart. The bridge does not unload ReportingObserverFocused or delete its state/private configuration. Follow that observer's own bounded diagnostic cleanup contract separately. Do not move/delete other plugins.
