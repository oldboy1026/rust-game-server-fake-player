# Independent connections and Rust browser count differences

Date: 2026-10-24, Asia/Shanghai. Times explicitly marked UTC retain the original sampling timezone. [Chinese original](./player-count-update-2026-10-24.md).

## Located difference

The user confirmed the target as `61.147.247.35:28015`, with query port `28016`. The Rust Community, Favorites, and History lists initially showed **5 players**. `D:\RustServer` contains local server files; the user later started a local test server there. It is not evidence of the remote server's current binaries or configuration.

Latest follow-up: the user resumed research, but a public-browser count fix remains unverified. The new round in [count-query-reporting-deep-2026-10-24.en.md](./count-query-reporting-deep-2026-10-24.en.md) completes the client notification chain, distinguishes PublicKey from API addresses, and examines server registration, callback pumping, and caching. In 12 natural samples, cp equaled RCON. Research Rust connections were zero while trusted counts rose 7→9, so that increase cannot be attributed to research accounts. One local runtime snapshot confirmed effectiveSecure=false and no EAC interface, while cached IsAuthenticated was 1; it is not a valid protected-EAC control. The diagnostic was unloaded, copied DLLs were moved out, the web service remained running, and no cleanup or rollback was outstanding. See [RESUME-2026-10-24.en.md](./RESUME-2026-10-24.en.md) for the full continuation.

The pre-shutdown leave/restore control below is historical: in 31 samples, RCON moved 3→2→3 while the public trusted count remained zero. The new batch at 20:45:40 UTC after restoration was also zero. Shutdown shortened the post-restore observation to about 4 minutes 42 seconds; the originally planned later batches were not observed. New observations do not rewrite that historical result.

| Source | Result at 2026-10-23 18:44–18:45 UTC | Meaning and limitations |
| --- | --- | --- |
| A2S_INFO `players` | 13 | Count in the server's query response |
| GameTags `cp` | 11 | Published active-player tag |
| Steam CM GMS `auth_players` | 11 | Authenticated-player count field for the exact game IP and port |
| Facepunch public count service | 5 | Value for the game address; the user's game browser also showed 5 |

All three independent sessions observed their own entity, the exact FinishLoading RPC, and a notification that the receiving party had validated the Steam ticket. During a normal service restart, A2S/cp fell from `13/11` to `10/8`; restoring the three sessions returned it to `13/11`. These records support that the independent sessions increased the server's published active count. There was no valid EAC session: ticket validation or player admission must not be described as EAC verification.

Other counts also changed naturally at 18:49–18:52 UTC, while all three research sessions remained `entered_game`. A single total-count change cannot automatically be attributed to a particular account.

## Why the browser could still show 5

The public endpoint is [https://api.facepunch.com/api/public/steamServers/playerCounts/rust](https://api.facepunch.com/api/public/steamServers/playerCounts/rust). It returns a mapping from game `IP:port` to an integer. This round retained only the target's value and a few cache-response headers. Observed new batches from 18:25 through 19:20 UTC all held the target at 5. During the official-client leave/rejoin control, the 19:25:14 UTC batch first changed to 4. Batch timestamps changed about every five minutes. `max-age=86400` does not mean counts are generated only once per day.

The installed copy's shared model has explicit clamping logic: parse `cp`, then apply `max(0, min(Players, authedPlayers))`. `ServerBrowserList` enables `clampPlayerCountsToTrustedValues` by default. Ordinary Steam-list conversion initially passes `int.MaxValue`; the browser later applies a finite cap.

This round recovered the consumption chain from actual client IL2CPP metadata and static GameAssembly code. With the option enabled, the browser triggers a public-endpoint update. The successful callback parses address keys into a shared count map. The list looks up `Address + ConnectionPort`; on a match, it passes the mapped count as a finite cap to the shared-model constructor. `QueryPort` is a separate field and is not used for that lookup. A one-minute request threshold prevents this path from repeatedly requesting within a minute. It does not guarantee an automatic request every minute, and differs from the approximately five-minute backend file batches observed here.

Steam CM's `11` differed from Facepunch's `5`. Facepunch's generation algorithm, data sources, and delays remain unknown, so the fields cannot be equated. GMS also returned 9 at 19:04 UTC: that source was not permanently fixed at 11. The precise delay between session changes and query values remains unknown.

Later static review confirmed that failed or empty HTTP responses can retain an old client count map. The one-minute threshold starts when the request is sent, rather than when parsing succeeds. A previously unresolved exception is a Nexus identity condition, not a fixed five-player limit. See `player-count-cache-followup-2026-10-24.json`.

## Official-client leave/rejoin control

Two sampling periods at 19:13:29–19:36:15 UTC produced 48 observations. The user first confirmed returning to the main menu, then confirmed re-entering the world at approximately 19:24:30 UTC after being prompted to reconnect. The three independent sessions remained unchanged. Safe snapshots at 19:14, 19:21, 19:27, and 19:35 confirmed their own entities, FinishLoading, and ticket validation; they ultimately remained for about 30 minutes. Public batches stayed at 5 at 19:15 and 19:20, became 4 at 19:25 and 19:30, and became 3 at 19:35. The user also confirmed seeing 4 after refreshing Favorites.

The user's replies bound the operation times; they are not exact leave/world-entry timestamps. Other players also came and went naturally. The 5→4→3 change therefore cannot be attributed solely to the official client or used to infer backend filtering rules. No trusted-count increase was observed in the post-rejoin window. At the end, A2S/cp was 10/8 and GMS was 8. This establishes that the target's public value was not permanently fixed at 5, and an actual client refresh showed a change. It still does not establish that independent accounts were included in the trusted count. Sanitized records are in `normal-client-count-control-2026-10-24.json`.

A single A2S_PLAYER query at 19:26:47 UTC returned ten entries, matching A2S_INFO's ten at that time. Only the entry count was retained, without nicknames, scores, or raw datagrams. It cannot substitute for the active tag of 8 or trusted count of 4.

## Own-state diagnostics and statistics upload paths

Added `metadata.ownPlayerState`: it observes Sleeping/ReceivingSnapshot only in complete snapshots matching both the account and its entity. It exposes boolean values, snapshot count, and age at sampling. Unknown state is not replaced with a fabricated false; parse failures retain the previous value and let its age increase. After the control window, the management service shut down normally at 19:36:50 UTC, restarted at 19:37:02, and restored the three accounts with staggered timing. At 19:37:55 all three diagnostics showed Sleeping=true and ReceivingSnapshot=false, with four own-entity snapshots each and latest-snapshot ages of about 14–24 seconds. These are observations of actual own-entity state. No wake input had been sent. See `own-player-state-observation-2026-10-24.json`.

Static analysis of the local copy shows that ordinary FinishLoading does not equal waking. Normal waking needs a newly pressed input. A first input-only Tick may also fail in the server recording path if ModelState is missing, and there is a race with an already-awake state. This round sent neither Tick nor an administrator wake command. A causal link between waking and trusted counts remains unestablished. See `wakeup-lifecycle-evidence-2026-10-24.json`.

The newly located `AuthSessionValidated → Azure.OnSteamAuth` path records the validation result and active total. Connection, departure, and other events enter a server upload queue whose default interval is about five minutes. The per-minute active-player aggregation skips only empty/destroyed entities; team aggregation separately categorizes sleepers. No backend implementation linking those uploads to the public count service was found. Queue timing cannot be equated with trusted-count generation timing.

Server-upload paths and read-only RCON preparation are in `trusted-count-reporting-evidence-2026-10-24.json` and [rcon-player-count-observation.en.md](./rcon-player-count-observation.en.md). DryRun especially needs checking: in that mode, the Facepunch uploader may increase upload-byte statistics without sending HTTP. The user later supplied RCON access and authorized a temporary configuration control, recorded below.

## Implemented changes and runtime experiments

Persistent Rust sessions now report Steam game activity according to their actual lifecycle: report the Rust AppID at start, attach the real server IP and port after transport connection, and restore the user's saved activity configuration after cleanup. Other Steam game-session occupancy is respected. This does not set a fabricated server identity, process identity, or security state.

Experiments with activity reporting for one account, a normal reconnect while preserving activity, and automatic real activity/address reporting for three accounts did not increase Facepunch's value in the new batches observed. **The activity improvement is not a verified browser-count fix.**

Added read-only diagnostics:

- `GET /v1/accounts/{id}/rust-session`: `steamAuthentication` returns only booleans such as ticket activity and whether validation completion was observed.
- `GET /v1/accounts/{id}/rust-steam-count`: uses the existing Steam login to query the GMS authenticated count for the exact game address. A separate `serverList` field retains the result of `GameServers.GetServerList`. It creates no game connection and returns neither raw lists nor tickets.
- `tools/rust-research/observe-player-counts.mjs`: samples A2S and the target Facepunch value in parallel and retains batch-response headers to distinguish counting and caching layers.

The public `serverQuery` wrapper in `steam-user@5.3.0` still reads an old port field and incorrectly converts the new IP object. The diagnostic therefore reads fields using the verified current protobuf schema. A decoded header `eresult=2` may be an omitted field's default value. Success is assessed from an error-free response body containing a valid count for the exact target; the default value is not an observed rejection.

`GameServers.GetServerList` supplied no target count in either the logged-in query or a credential-free anonymous control. Anonymous controls filtered by game address and query address were both empty. That does not establish an unregistered target, or show that changing the filter is the only necessary fix. This interface has not explained the count difference, and the authentication semantics of its `players` field are not confirmed by a specification.

## Connection recovery during research

After a normal management-service restart at 18:56 UTC, Steam cold-start login failed for all three accounts. Credential-free diagnostics found that direct access to the public CM directory timed out, whereas reusing the locally configured HTTP proxy retrieved the directory and allowed login. Website requests had used the system proxy, but SteamUser had not inherited it. The fix lets CM reuse the existing proxy and adds the explicit `STEAM_CM_PROXY=direct` override.

All three Steam logins recovered at 19:00:48–49 UTC. Rust connections needed staggering to respect the server's rate limit. A brief Steam disconnect/automatic reconnect occurred at 19:03 UTC; the corresponding Rust tickets became invalid and their sessions stopped. New tickets were then obtained normally and sessions restored with staggered timing. By 19:06:52 all three Rust sessions again confirmed their own entity, FinishLoading, and receiving-party ticket validation. The proxy fix addresses local cold-start networking; it is not a trusted-count fix.

## Target runtime state obtained

The user subsequently supplied RCON access and confirmed that eight internal players consisted of three research connections and five normal players, while the game browser showed only three. A read-only query at 19:44:23 UTC confirmed Players=8, Joining=0, Queued=0, Protocol=2635.289.1, `gameplay_analytics=False`, `gameplay_tick_analytics=False`, `performance_analytics=True`, `dryrun=False`, and `eac_gameplay_data=True`. Event tables used enabled FPApi(server), with a default five-minute upload interval.

Static analysis confirmed that Gameplay defaults to False, so the current value is not inherently a configuration error. The existing AggregateLoop rereads it every 60 seconds; enabling it needs no restart. Not all connection, departure, and Steam-validation events are controlled by it. The user explicitly authorized temporarily enabling only that setting for about 12 minutes and restoring False afterward, without restarting the server. Enabling was confirmed at 19:49:32.939 UTC; restoration to False occurred at 20:01:36.244, and a second read-only query confirmed False at 20:01:50. Independent sessions remained unchanged, without wake input. Administrative credentials and endpoints are not published with these records.

Players stayed at 8 in all seven server observations. Total events grew from 605 to 12495; Uploaded Bytes grew from 98981 to 859058. With DryRun=False, FPUploader increments upload bytes only after the HTTP success-status check. This supports that HTTP uploads received successful status codes, but response bodies were not verified. It does not establish backend event acceptance or inclusion of accounts in trusted counts. Observed new public-file batches at 19:50, 19:55, and 20:00 all remained 3. No browser-count improvement was observed in this window; longer backend delays remain possible.

Passive WebRCON listening at 19:53–20:03 UTC received no analytics/uploader-matching messages. Sixty-three unrelated messages were discarded without retaining their contents. This describes that push stream; it does not prove every upload was error-free. Sanitized complete observations are in `gameplay-analytics-control-2026-10-24.json`.

## Preparing a local official-client control

The user started a test server at `127.0.0.1:20090`, query port 20091. Its actual serverinfo showed zero players and Protocol2634.289.1, while A2S showed zero players/cp0 and version2635. Static disk inspection confirmed that Rust.Global retained a printable 2634 constant, while the Assembly-CSharp identity-protocol check and platform-version publication inlined 2635. A normal 2635 client could therefore be tried; the printable 2634 alone did not establish incompatibility. File hashes and method evidence are in `local-server-version-evidence-2026-10-24.json`.

Npcap was unavailable. In a ten-second pktmon control limited to the loopback UDP query port, three normal A2S_INFO exchanges succeeded but zero packets were captured. Capture was stopped and filters cleared. This method was therefore not used to decide whether local game messages were sent. The new read-only Oxide source `CountDiagnostics.cs` compiled and loaded on the local server. Its first valid aggregate was zero active, zero sleeping, and zero connected. It returns state counts only to an authorized caller, for comparisons during normal client entry, loading, and exit. Oxide can compile the source into a plugin assembly; the plugin itself changes neither counts nor authentication.

The user then updated and restarted the local server, restoring key disk DLLs to their original versions. The new process ran Protocol2635.289.1. During direct official-client connection, 20:07:34.772 UTC showed Players0/Joining1; by 20:07:36.814 it was Players1/Joining0. The user confirmed world entry, and A2S/cp both showed 1 at 20:08:21. Loading of the old Oxide diagnostic plugin was not confirmed in the updated process, so the old process's plugin baseline is not player-state evidence for the new process. Source version 0.1.1 was prepared and checked as read-only, but had not been compiled/executed there.

To observe loopback traffic, a local two-socket UDP relay recorded metadata only and forwarded port 20093 unchanged to 20090. At 20:10:35.122 UTC it received the official client's first datagram. Offline-handshake first bytes 5→6→7→8 and subsequent bidirectional traffic were observed. The server became Players1/Joining0 at 20:11:04.405, and the user confirmed entering the world through 20093. The user then left normally and returned to direct connection. First bytes and sizes do not prove Rust application messages or EAC authentication. The tool retained no full payloads or tickets. Actual records and cleanup results were saved as local observation evidence.

The relay expired normally at 20:14:48 UTC after recording 7722 datagrams: 3845 client and 3877 server. Send callbacks reported no errors; that is not an end-to-end delivery guarantee. Metadata totaled about 893 KB, without full payloads. Port 20093 had no listener afterward. A read-only check at 20:15:40 confirmed the official client was directly connected again, Players1/Joining0. Later lifecycle code corrections were not rerun in a network observation; evidence retains the SHA-256 of the source actually executed.

A local test server absent from the public list can validate local state and reporting paths, but cannot by itself establish Facepunch trusted-count inclusion. This official-client control established a usable network-observation path; it did not solve the remote-browser count issue. See `local-test-server-observation-2026-10-24.json`.

## Follow-up controls with only research accounts present

At 20:18:32 UTC, both RCON Players and status were 3. Status identities were matched against research accounts only in local memory: three research accounts, zero other players. The public trusted value was also 3. Equality alone did not establish that all accounts were included. A new public file changed to 2 at 20:20:42, while RCON at 20:20:43 and 20:21:14 still showed three research accounts and zero others. The earlier equality therefore could not be called a fix.

The first normal disconnection of account 3 occurred at 20:21:41.830 UTC, reducing the internal count to 2. The public 3→2 change preceded that disconnection, so it is not causal evidence. The user then confirmed manually restoring the account early; three research connections were back by 20:23:54. The required continuous ten-minute absence was not met. The first run ended normally with no restoration needed. Sanitized records are in `interrupted-count-control-2026-10-24.json`; its `serverStatusRows` means RCON list-row count, not the game-browser display.

With user authorization, a new independent window began at 20:29:51 UTC. After a 90-second baseline, account 3 disconnected at 20:31:21.276 and automatically restored at 20:41:25.305. The run stopped normally at 20:46:07.039 because the user was preparing to shut down; restoreRequired=false. This run matched only the three saved research accounts, validated unique 17-digit identity strings, and detected early reconnects. None of 31 samples contained other players. Continuous absence lasted about 604 seconds; post-restore observation lasted 281.734 seconds, short of the planned 600-second return window. A read-only Steam CM authenticated count at 20:32:44 was 2, agreeing with RCON and later cp2, while public trusted remained zero. New batches at 20:35, 20:40, and 20:45 also remained zero. Server configuration stayed unchanged and no wake input was sent. See `repeat-count-control-2026-10-24.json`.

At 20:46:05, before shutdown, all three sessions still reported entered_game. Account 2's latest own snapshot showed Sleeping=false, and account 3 retained an older false. No Tick had been sent; the reason was unknown. The earlier all-sleeping snapshot cannot be generalized to the full period. Analytics was confirmed False again at 20:47:20, and a normal shutdown of the local research service was requested at 20:47:31. Fresh state should be checked before resuming experiments the next day.

## DLL installation status

The user had supplied an old `FakePlayers.dll` that afternoon. The original was only read statically; it was neither installed nor executed. Managed metadata was readable, with name obfuscation and string protection. One old non-generic IList read path was incompatible with the current local ListHashSet. Protected plugin bodies and external-request paths remained unexplained. LicenseKey is a licensing clue, but does not establish whether a request concerns licensing or counts. A local incompatibility is not the complete failure cause and does not prove any ability to change Facepunch trusted counts. See [fakeplayers-static-2026-10-24.en.md](./fakeplayers-static-2026-10-24.en.md) and its JSON counterpart.

Current evidence did not support installing a supposed count-fix DLL. The local original path already generated `cp` from the active list; six local plugin sources did not represent the remote environment. A later read-only inventory listed 24 target plugins, and a version command reported RustSB extension 1.1.5. Complete remote source and extension binaries were not obtained. In the public documentation checked, RustSBAuth authenticates plugin licenses; it is not evidence of Steam/EAC player authentication. Plugin names and versions do not prove count modification. See `remote-plugin-inventory-2026-10-24.json`.

CountDiagnostics 0.1.2 added a Steam backend-login field and compiled offline against 17 local references, but was not deployed/run. Static review confirmed that IsValid only checks an interface pointer, whereas LoggedOn calls BLoggedOn; global.steamstatus does not provide that state. At that point, the user still had only RCON access. Verified boundaries and remaining work for direct client statistics reporting, Tick/eye-position semantics, and real Steam server identity are in new static-evidence JSON files, indexed in [RESUME-2026-10-24.en.md](./RESUME-2026-10-24.en.md).

Further work must examine the remaining real-player initialization steps, actual target-side reporting, and the Facepunch backend source. The issue is solved only when external statistics and the Rust browser after a normal refresh show a verifiable change.

A later afternoon round completed fresh own-state diagnostics and 31 read-only observations; see [resume-own-state-2026-10-24.en.md](./resume-own-state-2026-10-24.en.md). Snapshots for all three connections were Dead. Sleeping=false cannot establish that a player is awake. All three subsequently disconnected. Research connections were zero and other players were changing when the trusted count later increased, so that is not fix evidence.

Normal self-respawn `respawnOnDead` was then implemented, disabled by default and limited to once per connection. Locally, a protected-encryption requirement caused a normal stop without sending a command. On the original target, a single account's send was followed by its own alive/positive-health/sleeping snapshot and a separate read-only playerlist observation of current positive health. The connection closed normally after 663.734 seconds and cleaned up its ticket. A public trusted-count association of 8→9→8 occurred, but another account briefly left/rejoined, and eligibility/backend delay remained potential confounders. This round did not start RustClient or manually refresh the browser, so it is neither a game-UI test nor a verified fix. The first run's 129 session observations, 20 side-channel RCON observations, 22+11 departure observations, and retrospective identity-set comparisons are in [respawn-observation-2026-10-24.en.md](./respawn-observation-2026-10-24.en.md) and its JSON counterpart. An independent repeat with account 2 was planned separately, preserving the first run's evidence.

No test suite was added or run in this round. Network queries and connection observations are the research records described above. Syntax checks do not establish a browser-count fix.

Static/public-source evidence is in `player-count-display-2026-10-24.json`, `trusted-count-public-evidence-2026-10-24.json`, and `steam-auth-validation-evidence-2026-10-24.json`. Sanitized runtime snapshots are in `player-count-live-evidence-2026-10-24.json`. Raw local observations remain in ignored `work/`; credentials and tickets are not committed with the report.

## Static review of security-state diagnostics

`server.eac_gameplay_data=True` only means configuration allows additional EAC analytics. Original `CanSendAnalytics` also requires a non-null EAC interface. A non-null interface alone still does not establish successful BeginSession, client registration, protected authentication, or backend receipt. No `server.secure` was found among 2426 original console registrations. No verified command was found to return only this account's EAC interface, client handle, and authentication state.

Verified no-argument variable queries include `server.encryption`, `server.eac_gameplay_data`, and `server.strictauth_eac`. They return configuration integers or booleans. `server.encryption` does not read the effective runtime value: during startup, `ServerMgr.OpenConnection` can derive `Net.sv.encryption` and `Net.sv.secure` separately. The word "secure" in the ordinary `status` text header is a static constant. `serverinfo` also lacks an EAC-state field. Neither verifies the current protected state. Server plugins may still intercept or log commands.

Internal `EACServer.IsAuthenticated` only checks whether the connection-state enum equals 2. Non-secure/editor paths can also directly produce that value. Effective server settings, EAC-interface availability, actual client mapping, and the source of an authentication state must therefore be distinguished. Entering the world, FinishLoading, or one authentication boolean does not prove a protected session. Further controls will compare actual official-client state on the user's local test server. This part performed static assembly reading only: no RCON execution, security-setting changes, EAC start/stop, or new client input. Complete methods, registrations, output sensitivity, and limitations are in `server-security-diagnostics-evidence-2026-10-24.json`.
