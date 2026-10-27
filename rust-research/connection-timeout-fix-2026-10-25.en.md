# Repair of the timeout after the first PlayerTick

Historical repair: 2026-10-25. See the [original report](connection-timeout-fix-2026-10-25.md) and [live regression evidence](connection-timeout-fix-2026-10-25.json). This repaired connection maintenance; valid protected EAC sessions and public population remained unverified.

## Cause and implementation

PlayerInit resets lastTickTime. Its zero sentinel reports timeSinceLastTick as zero, so earlier clients sending no Tick did not start that response timer. The first valid PlayerTick updates it. ServerKickUnresponsivePlayers then applies playertimeout to alive players outside ReceivingSnapshot, including sleeping players.

Three historical disconnects occurred after 62.875, 62.234 and 62.672 seconds. One completed the three-frame wake; two had an interrupted one-frame wake. A separate 1.657-second AuthTicketAlreadyUsed refusal was unrelated. Raw refusal text was unavailable for the three older failures. Static conditions, configuration and regression support the unresponsive-timeout explanation, but do not supply a direct log diagnosis for every old failure.

The normal owner-only, parameterless ClientKeepConnectionAlive RPC updates lastTickTime. However, BaseEntity.SV_RPCMessage first drops RPCs when an alive, awake player is stalled under rpcstallmode. Native-send success therefore does not prove handler execution. At 17:38:11 UTC the target reported playertimeout 60, rpcstallmode 1, threshold 0.8 and fade 2.5; none was changed.

Maintenance begins after the first Tick independently of wake progress. It sends the own-entity RPC rather than replaying coordinates or buttons. A two-second candidate failed after 62.266 seconds despite successful wake; that failed result is retained. The final cadence is 100 ms. A local gap above 500 ms or a send failure closes only the affected connection rather than sending a backlog burst. Stricter servers, network conditions or scheduling can still disconnect.

Known UI/pet metadata RPCs and identical unparented position echoes no longer interrupt wake indiscriminately. Partial echoes do not refresh complete-model age. Unknown own RPCs, real corrections, parent/mount changes and unavailable complete state still interrupt; unsafe release closes the connection. Fixed error categories distinguish response timeout, ticket-in-use and unknown post-admission exits. Public metadata excludes coordinates, entity IDs and raw refusals. This historical version still rejected EAC/nonzero encryption; later level-1 support is documented separately.

## Validation and live result

Twenty-one Python state/maintenance tests, twelve worker lifecycle tests and 40 Node tests passed. A simulated 0.8-second RPC gate demonstrated that two-second sends could succeed natively but be dropped server-side, leading to a sixty-second timeout. The final cadence remained awake beyond eighty seconds. Existing real Rust.Data interoperability checks still passed three frames and 81 assertions.

The live window ran from 17:39:53.959 to 17:41:20.204 UTC. Three-frame wake and Sleeping clearance were observed by 2.156 seconds; the session remained entered_game at 82.156 seconds. It sent 738 maintenance/actions in total but only three ordinary input frames. Eighteen samples covered 80.187 seconds after the first observed Tick without the former timeout. Life/sleep fields remained latest-snapshot observations, not fresh server confirmation each second.

The exact newly started session stopped gracefully with its readable ticket inactive. No 39-account, public-population or indefinite-duration test ran. The historical final state was 39 Steam logins and zero Rust sessions, with no cleanup debt; all imported accounts were subsequently deleted on 2026-10-27.

New Python workers loaded the repair; existing workers did not upgrade automatically. At this report's cutoff, automatic approval had rejected the main-backend restart with the reason “blocked by policy”; it was not executed or circumvented. Consequently the then-running Node process still served older counter/error wording. Later reports describe subsequent reloads separately.
