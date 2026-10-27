# Local live run of the passive Harmony return observer

Historical run: 2026-10-24. See the [original report](reporting-observer-local-2026-10-24.md) and [build/runtime evidence](reporting-observer-local-2026-10-24.json). Built-in Harmony hot-loaded the self-written observer and captured one normal update-wrapper return of true. **Public-count repair was not verified.** The run did not modify unknown FakePlayers code, game binaries, player counts or EAC state, or manually replay reporting calls.

No running Oxide instance had been confirmed, but the official harmony.load/unload commands were available. OnLoaded checked the Steamworks MVID, exact instance signature and absence of existing patches, then manually installed a postfix accepting the result by value. It used no automatic patch attributes or identity/name/score/ticket parameters.

The source SHA-256 was 8a2105b4f93b743423a621e80976b3621a0a3c9d9a106b82f05d29432a988757; the real-reference build hash was 60d78f83eed6d76be6db6555184dad3f7f3177be42661943825ded33a1a1ec20. Input references were unchanged. Earlier CLR 4 validation passed eight groups and 38 assertions. A separate .NET 10 failure remains part of the compatibility evidence.

## UTC sequence and cleanup

- 07:28:44.680: OnLoaded reported observing, successful patch checks and zero calls.
- 07:28:47.855: The preconnection sample still showed zero calls.
- One already-online Steam account connected normally to the local server. It reached Approved but stopped at unsupported encryption after 1.61 seconds, without Ready, respawn, Tick or world entry.
- 07:28:52.855: The observer reported calls 1, true 1, false 0, skipped 0 and write errors 0.
- 07:28:53.570: Official unload set the state to unloaded and patchInstalled=false.
- 07:28:53.786: The driver finished without stop/unload debt, with its ticket inactive. The copied DLL was hash-verified and removed.

The source DLL outside the scan directory was not executed, and nothing was deployed remotely. The timer stopped and the exact patch was removed, although the assembly remained in the AppDomain. A monotonic 180-second deadline is checked in the postfix; this run lasted under ten seconds, so real-time expiry and races were not fully tested. Before moving the copied DLL, the driver waited for the asynchronously written final state matching the same startedUtc.

## Interpretation

The true return fills a previously missing Boolean observation, but the update occurs before later EAC handling and the test stopped at protection. An existing nonresearch player was also present. Because the observer deliberately omitted identity, one call cannot be attributed uniquely to the research account or labeled one accepted player. Genuine-path interception also does not prove coverage of every compiled or inlined caller.

At 07:30:24, a read-only roster still showed the same existing player as at 07:15/07:18. Connected-duration growth of 3378.339 seconds matched wall time within 0.1 seconds, supporting continuity across the window. This is neither callback attribution nor continuous-capture proof; duration semantics were not separately audited.

This local server differs from the public target, and no remote Boolean was obtained. The next step was authorized target deployment and correlation with a genuine lifecycle. Repeating successful calls alone is not a demonstrated count fix. Private rosters and credentials remain ignored; the public JSON contains aggregates and hashes.
