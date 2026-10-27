# Four-layer population comparison with no research game connections

Historical observation: 2026-10-24, 15:49:36–15:55:08 Beijing time. [Original](count-chain-observation-2026-10-24.md);[twelve samples/headers/hashes](count-chain-observation-2026-10-24.json).

Twelve read-only parallel queries at thirty-second intervals found RCON 11→12→11, with cp equal to near-simultaneous RCON in every sample. A2S_INFO players exceededcp by 2 or 3, bots 0. Facepunch changed 7(batch07:46:44UTC)→9(batch07:51:44). An earlier 15:47:16 sample 14/10/trusted 7 and RCON 10 twenty-two seconds later show that the common+2 offset was not fixed. Sources were not atomic andcp has its own publication cadence; no plugin was blamed.

Adjacent roster sets changed twice. The manager showed three Steam accounts online and zero research Rust connections before/after, so public 7→9 was natural population, not research-account adoption. The new batch excludes “one unchanged cached file throughout” but does not disclose eligibility/backend inputs. No manual game-browser refresh was observed.

The manager lacked target address context from an old session, so the existing read-only CM route could not be reused without a new game connection; none was created. A separate anonymous Steam session queried the target normally: GMS timed out and another GetServerList did not return it. It logged off normally. These are missing observations, not zero population, unregistered status or authentication denial.

No account login for play, game entry/exit, configuration change or remote diagnostic deployment occurred. Raw rosters stay ignored; public output retains only counts, times, set comparisons and source hashes. Public-count repair remained unverified.
