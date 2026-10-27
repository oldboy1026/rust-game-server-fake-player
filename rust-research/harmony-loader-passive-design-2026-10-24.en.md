# Rust Harmony loading and passive return-value diagnostics

Historical static design: 2026-10-24. [Original](harmony-loader-passive-design-2026-10-24.md); [hashes/MVID/tokens](harmony-loader-passive-design-2026-10-24.json). Assemblies were data only; no load command, plugin execution, restart or server setting change occurred. Oxide files on disk do not prove a running Oxide framework; this design uses built-in Harmony independently.

HarmonyLoader.LoadHarmonyMods (token 06000008) has RuntimeInitializeOnLoadMethod(BeforeSceneLoad=1), confirmed against Unity metadata; absence of a normal caller does not make it unreachable. It scans only top-level root/HarmonyMods/*.dll, creating an absent directory and ending that scan. There is no recursive watch/rescan; later file copy is not proof of loading. EnsureHarmonyIsLoaded (token 06000007) reads Managed/0Harmony.dll and resolves PatchAll(Assembly), UnpatchAll(string), DEBUG and FileLog. Current 2.3.1.1 signatures match statically; extra Harmony binaries are unnecessary.

ConsoleGen (token 06000203) registers admin-only harmony.load/unload; ConVar.Harmony wrappers (tokens 0600A150/A151) pass the first argument to TryLoadMod/TryUnloadMod. Example contracts, not executed here:

```text
harmony.load ReportingReturnDiagnostics
harmony.unload ReportingReturnDiagnostics
```

Use a fixed extensionless basename and verify current command registration before deployment. The loader strips basename and specially handles lower-case .dll suffix. The entry is a public concrete class with a public parameterless no-op constructor implementing global IHarmonyModHooks; OnLoaded/OnUnloaded args are currently empty public reference types, not RustPlugin/MonoBehaviour lifecycle classes.

Loading first unloads the same name, then Cecil renames the assembly with a GUID in memory and Assembly.Load(byte[]) constructs all matching hooks. Assembly.Location is therefore unsuitable for output paths. Owner is `com.facepunch.rust_dedicated.<basename>`; PatchAll runs before OnLoaded. Avoid automatic patch attributes if preflight/manual installation is intended. Callback exceptions may still leave the mod listed loaded, so check actual patch state. Unload invokes OnUnloaded then owner-specific UnpatchAll and removes the registry entry, but does not unload assemblies from the AppDomain. Custom owners, timers/handles need explicit cleanup; global ownerless removal is forbidden. Startup skips known dependency prefixes System./Microsoft./Newtonsoft./UnityEngine.; a diagnostic filename should avoid those. Standard installed references are sufficient.

The passive target is internal instance bool BUpdateUserData(SteamId, string, uint), token 06000220, whose upper void wrapper discards its bool. OnLoaded should check actual module/MVID/exact signature and existing patch chain, then manually add only `static void Postfix(bool __result)`. It counts normal true/false returns with Interlocked, without arguments, identity, tickets, prefix/transpiler/finalizer, retry, Flush or auth/event calls. Original exceptions need not invoke the postfix, so these are neither attempts nor unique-player failure counts. Known competing patches must be reported or installation refused. Optional by-value __runOriginal is supported by this Harmony's generated initialized local, but cannot exclude other return changes.

Resolve/validate one fixed output JSON path on initialization. A background standard-library timer may read atomic counts/time and write only that file; it must not call game/Steam/analytics or expose tags, identities, addresses, parameters or exception text. Stop sampling/writes, wait safely for own writes, disable callbacks, and remove/check only this exact postfix/owner on unload. A count deadline is not proof of patch removal. True is still not final admission, EAC or Facepunch acceptance. Real install/trigger/cleanup remained future validation; unknown FakePlayers was never placed in the load directory.
