# One ordinary PlayerTick wake cycle

Historical initial implementation: 2026-10-25. See the [original report](player-tick-wake-2026-10-25.md). Later live wake results and the timeout repair are in the [connection-maintenance report](connection-timeout-fix-2026-10-25.en.md). The initial lack of live testing described here belongs to this implementation stage.

The rust_player_tick.py module adds one optional cycle through rust-peer.py --wake-on-connect or the wakeOnConnect API Boolean, which defaults to false. Single and batch inputs require actual Booleans. Initial work opened no new connection, game process or ticket, and changed no running session, service or server configuration. EAC remained unsupported; this version also rejected nonzero encryption.

## State and send requirements

Prerequisites include sent identity/Ready, level-0 approval, exact own FinishLoading, a complete own snapshot no older than two seconds, advancing entity sequence, positive alive health and connected state, and no ReceivingSnapshot, Spectating, Wounded or TransferLoading state. Supported poses are stationary, grounded and upright/crouched, without parenting, mounting, water or special movement. Server time only detects regression; it is not subtracted from the local clock.

The complete snapshot privately preserves position, view and model state. Omitted full-protobuf zeroes are restored, but missing flags do not imply OnGround. A previous mount pose can remain after mount UID and flags clear; retaining poseType does not assert that the player is still mounted. Supported neutral eye height is y + 1.5 − 0.6 × ducking. Crawl, lean, mounted eyes and camera simulation are outside this implementation.

The cycle contains at most three frames, designed 50 ms apart: neutral buttons 0, crouch 64, then release 0, with activeItem 0. Each writes inputState, position, modelState, eyePos, parentID 0, deltaMs 50 and explicit component zeroes to avoid ProtoDelta inheritance. It uses Medium priority, RELIABLE_ORDERED 3 and channel 0. Captures establish reliability/channel, not every official priority or cadence choice.

Old or duplicate own sequences cannot refresh state; 0xFFFFFFFF is diagnostic only. Entity replacement clears FinishLoading association. Unknown own RPCs, destruction, position/flag corrections or invalid complete state invalidate retained input state. Unsafe release or send failure closes only this connection. A scheduler stall above 250 ms does not replay late actions. This is one attempt, not a repeating activity loop.

The tickPacketsSent counter means native-send success only, with a maximum of three. Press and release are separate. Awake observation requires a newer ordered usable complete own snapshot with Sleeping cleared within five seconds, and awake_observed additionally requires release completion. Timeout is unconfirmed; an already-awake initial state causes no input. HTTP exposes no coordinates, entity IDs or full models. Later state correlation is not proof of causation, EAC authentication or public-count eligibility.

## Offline verification

All 6, 517 historical outbound unfragmented Ticks used reliability 3/channel 0. Of 29 own snapshots inspected offline, 15 were supported: eleven awake and four sleeping. The others were rejected.

Fifteen Python state tests, eight worker lifecycle tests and 38 Node tests passed. They covered omitted zeroes, old poses, frame timing, stale/foreign/replaced entities, invalid state, stalls, failures, admission, wake, cleanup and EAC stops. A real Rust.Data Deserialize(isDelta=true)/Serialize interoperability check passed three frames and 81 assertions, starting with nonzero existing fields. Its assembly SHA-256 was 1d62baef9b339f0416e6529618365c1ecad01791a833e77e76eb6c8464406104. The game was not started and no network was opened for that check.

Relevant commands are python -B tools/rust-research/test_rust_player_tick.py, python -B tools/rust-research/test_rust_peer.py, npm.cmd test in the app, and Test-PlayerTickInterop.ps1 -ServerDirectory <local-server-directory> under .NET 10. Interoperability output remains in ignored local work; this report has no same-name public JSON artifact.
