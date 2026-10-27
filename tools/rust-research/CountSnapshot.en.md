# CountSnapshot: One Read-Only Snapshot of a Running Server

[English](CountSnapshot.en.md) · [简体中文](CountSnapshot.md)

This DLL uses Rust's built-in Harmony loader to read one aggregate snapshot on a test server without Oxide. It has no Harmony patch, timer, network operation, console-command registration, or player action. It changes no population, authentication, configuration, event, or reporting schedule. It is not a population fix.

The source locks the exact MVIDs of three inspected modules. Other builds return `unsupported_modules`; inspect and rebuild for a new version rather than deleting those checks.

Build offline from the repository root with an explicit server directory:

```powershell
./tools/rust-research/Build-CountSnapshot.ps1 -ServerDirectory '<your-server-directory>'
```

After checking `work/count-snapshot-build/build-safe.json` and matching input/output SHA hashes, put your own built `CountSnapshot.dll` in that server's `HarmonyMods`, then use the administrator console:

```text
harmony.load CountSnapshot
```

Read `HarmonyMods/CountSnapshot-state.json`. Require a fresh `startedUtc`, `status=captured`, and `unloaded=false`. Immediately unload:

```text
harmony.unload CountSnapshot
```

Wait for the final file with the same `startedUtc` and `unloaded=true`, verify the copied DLL's hash, and move that DLL out to prevent automatic loading on restart. Do not overwrite someone else's same-named file. Official unload does not release the assembly from the AppDomain. Background writes can lag; do not reload before the final file is confirmed, or an old instance can overwrite a new result. Write-error counts become visible only on the next successful write; an output timeout is not a successful sample.

`OnLoaded` reads game collections on the normal loader callback thread. A background thread writes only the previously captured aggregate string. Use the inspected official management command path; do not invoke `OnLoaded` from an arbitrary worker thread.

| Field family | Meaning and limit |
| --- | --- |
| `active*` | Actual active-list/alive/sleeping/connected/snapshot states at load, not public population |
| `connection*`, `authenticatedConnections` | Network collection and original `isAuthenticated` getter |
| `effectiveSecure`, `effectiveEncryption` | Actual running `Net.sv` fields, kept separate from configuration variables |
| `steamInterfaceValid`, `steamLoggedOn` | Interface availability and original `BLoggedOn` result |
| `eacInterfaceAvailable` | EAC interface exists; no proof that BeginSession succeeded |
| `eacMappedConnections` | Nonzero `GetClient` handles; no proof of registration or authentication |
| `eacStatusAuthenticatedConnections` | Cached `IsAuthenticated` result, which can be true on nonsecure paths; not a valid EAC-session proof |

Player and connection/EAC counts are separate aggregates, without per-account attribution or identities, names, addresses, tickets, or keys. Any sampling exception makes the entire result `snapshot_failed`; partial output is not presented as a complete snapshot.

Sampling occurs once at load. The final unload file retains that same sample and updates its unload marker: **it is not a second sample or evidence of continuous stability**. On a local server absent from public registration, these fields cannot prove Facepunch acceptance or explain remote eligibility.
