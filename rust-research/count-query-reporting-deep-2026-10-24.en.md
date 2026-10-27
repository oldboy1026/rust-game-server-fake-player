# Public population: query/display/reporting chains and unresolved backend

Historical analysis: 2026-10-24, 16:00 round. [Original](count-query-reporting-deep-2026-10-24.md). The client/server deep JSON records preserve exact hashes, tokens and IL ranges. No public-count repair was verified.

The applicable ordinary browser gets Steam server data/cp and separately requests `https://api.facepunch.com/api/public/steamServers/playerCounts/rust`, an IP:**game connection port**→integer map. It computes `max(0,min(cp,trusted))`. Its one-minute request threshold is distinct from the observed roughly five-minute upstream batches.

Before requesting, the client checks platform PublicKey; ApiUrl is another getter used later to build the URL. Slots154/148 were distinguished, and an older JSON description of the gate as API-base was corrected. The PublicKey here is a static build value, not a retrieved account ticket; its literal was not published. Successful parsing publishes the mapping and raises a notification. Browser OnEnable subscribes; the applicable enabled/nonempty/trusted-cap branch reapplies counts and marks the list dirty; OnDisable unsubscribes. Recovered file-RVA chain: parser0x7b44c40→helper0x7b41610→integration slot89→Action→browser0x70ecd80→dirty0x70ed033. These are not live addresses. A missing notification is therefore not the leading explanation; current runtime subscription/redraw latency was not measured.

## Server-side findings

Twelve modules/313 methods/333 calls were focused, and 266 parseable Managed modules received supplementary scans. SteamPlatform.StartSteamServer initializes, registers callbacks and logs on anonymously; these stages are separate from acceptance. The ordinary frame chain already pumps `ServerMgr.Update→SteamPlatform.Update→SteamServer.RunCallbacks→Dispatch.Frame`; another similarly named wrapper does not justify adding a second pump. AutomaticHeartbeats/AdvertiseServer both call SetAdvertiseServerActive rather than exposing a managed heartbeat timer. **SteamServer.ForceHeartbeat is only `ret` in this binary.** Identical cached GameTags/MaxPlayers/BotCount/SetKey skip native writes, but no mismatch was observed. Selected connect/disconnect handlers logged without replaying metadata; that does not prove native reconnect loses data. No exact managed SetPlayerCount definition/call was found, without covering native/reflection/runtime patches. An extra analytics-thread PlatformService.Update belongs to shutdown waiting, not ordinary continuous upload.

Real active players feed periodiccp; normal Steam validation feeds nativeBUpdateUserData; natural lifecycle events feed existing upload batches. The connection from any of those candidate inputs to Facepunch's backend count was **not recovered**. Authentication, EAC, analytics and temporal correlation cannot be substituted for causal evidence.

Twelve 15:49:36–15:55:08 samples had RCON 11→12→11 and identicalcp; A2S was 2/3 higher, bots 0. Public batches changed 7→9 while research Rust connections stayed 0; other roster sets changed twice. A prior 14/10 sample also disproves a fixed offset 2. This was natural population, not research success.

At 15:50:18 a normally loaded, unpatched local CountSnapshot read Steam logged-on, secure=false, encryption 1, no EAC interface/handles, and cached authenticated1; active/alive/awake/connected were 1. Official unload/file removal were confirmed. This local server is not a valid EAC baseline; level 1 stopping is not necessarily EAC rejection. The diagnostic reads once and reuses its cached unload output, not continuous sampling.

Re-auditing seven raw snapshots from the earlier 12-minute experiment found DryRun=false, only FPApi(server) serializing, and increasing Uploaded Bytes consistent with its HTTP-success path. Total Bytes alone measures serialization; outer upload tasks may catch network errors. Task completion, empty queues or aggregate bytes are not per-account backend receipts.

## Next evidence

Use a normally registered server with authorized diagnostic deployment and matching modules. Correlate one genuine account lifecycle: Steam callback→original BUpdateUserData result→actual secure/EAC handles/SDK callbacks/token result→natural table/uploader success categories→active/cp/A2S/several new public batches/browser refresh. Retain only aggregate categories publicly. Repair a normal path only after a real reproducible omission/failure; do not repeatedly Flush/replay events on speculation. Purchasing a new machine alone cannot reveal backend eligibility.

This round did not run unknown FakePlayers.dll, alter counts/authentication or upload constructed public data. Three Steam accounts/zero research games were left unchanged; bounded diagnostics ended with no unload/restore debt. Forty-nine evidence/hash/unload checks, six JSON parses and privacy/diff checks passed. Local compilation/load, source reasoning and public effects remain explicitly separate validation layers.
