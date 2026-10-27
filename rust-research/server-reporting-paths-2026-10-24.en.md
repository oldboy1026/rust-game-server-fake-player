# Normal server reporting paths and diagnostic plugin feasibility

Historical static review: 2026-10-24. [Original](server-reporting-paths-2026-10-24.md); [module hashes/methods/limits](server-reporting-paths-2026-10-24.json). Seven current local Managed modules were reread to avoid stale IL/hash assumptions. Assemblies were treated as data; no unknown DLL, plugin, configuration, network request or ongoing experiment was changed.

Normal observable paths exist for Steam profile updates, server information publication and existing analytics batch scheduling. **No plugin entry guaranteeing Facepunch acceptance of an account was found.** Their successes are not population-repair receipts.

Auth_Steam success invokes PlatformService.UpdatePlayerSession→SteamServer.UpdatePlayer→BUpdateUserData, whose bool return is discarded at IL000D. Within the reviewed modules, the visible caller was the auth-success branch, not additional wake/respawn updates. This makes its result a diagnostic point, not a demonstrated failure. PlayerInit adds the active list; after 2 seconds/every 30 seconds UpdateServerInformation checks Steam validity and publishes actual count as cp without sleep/first-Tick/per-player-EAC filtering. It does not directly set A2S_INFO players. Natural AuthSessionValidated→Azure.OnSteamAuth and ClientReady→Azure.OnPlayerConnected submit lifecycle events; repeated artificial calls would not be new genuine authentication.

## Candidate observation points

Public Steam add/remove events can count genuine validation/logon/disconnect callbacks. A checked Harmony postfix can observe original BUpdateUserData results without skipping/changing/repeating the original. Ordinary direct C# cannot access its internal wrapper result. A one-off genuine profile resubmission would only be a controlled candidate after proven original omission/failure, with the existing name/censor policy and no new auth session; its void wrapper cannot guarantee public effects. A private normal information method might be triggered once only after confirmed stale cp; current active/cp already changed normally. Existing public AnalyticsTable.Flush only sets `nextUploadStamp=DateTime.Now`; actual queue, uploader, Enabled, DryRun and manager loop still decide work. Default batches are five minutes, and a disabled uploader may clear events. The earlier 12-minute test already had upload-byte growth without public adoption, so shortening due time is not a verified missing fix.

Diagnostics must first verify actual target versions/framework/deployment, unsubscribe events on unload, and publish only counts/times/result categories rather than Steam IDs, names, IPs, tickets, URLs or keys. Offline compilation, an Oxide DLL on disk or RCON availability does not prove a plugin is running.

## EAC boundaries

EACServer.IsAuthenticated checks SDK status dictionary value 2. `authStatusEAC=="ok"` is another admission string controlled by strictauth_eac timing; neither is identical to completed asynchronous EOS ID-token validation. OnFinishLoading only sets the existing mapped EAC client's network-active state when interface/handle exist; normal EnterGame already calls it. Reinvoking it, calling OnAuthenticatedRemote, editing dictionaries or replaying auth events does not create genuine client authentication. Plugins may observe real callbacks, not replace the client.

The unknown FakePlayers sample's visible Update/chat/Ping entries did not establish a complete normal Steam-update/backend-count path; hidden operations remained in its interpreter. A known IList mismatch affected one visible admin-chat branch at that analysis stage, not proven periodic behavior. Later investigations expand that evidence separately.

The next justified work is one authorized normal-client lifecycle with actual native result/EAC/token/upload evidence, then a narrowly isolated candidate only if a real omission is found. Current target module/patch identity, native return, EAC/token final result and public eligibility remained missing. HTTP success or BUpdateUserData true is still not a per-account public receipt. No count-modifying plugin was created, deployed or run.
