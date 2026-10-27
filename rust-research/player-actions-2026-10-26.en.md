# Single-account player actions: implementation and limits

Historical report: 2026-10-26. Target `61.147.247.25:40176`, query40177. [Original](player-actions-2026-10-26.md); [sanitized evidence](player-actions-2026-10-26.json).

On `/rust`, open Player actions for one admitted account. Actions do not loop or automatically operate multiple accounts.

| Action | Behavior |
| --- | --- |
| Wake | Three neutral/crouch/release frames, if supported by a complete own snapshot |
| Respawn | One ordinary respawn request after a fresh own-dead snapshot and own FinishLoading |
| Suicide | Explicit confirmation plus fresh own-alive state; server rules/cooldowns still apply |
| Stop | Stops that action; closes only this account's Rust connection if pressed input cannot safely be released; idle stop sends nothing |
| Short steps | Explicit confirmed flat unobstructed area; at most0.28m in own-view yaw, six frames including neutral/release |
| Jump | Same area confirmation; experimental16-frame trajectory, at most1.5m, returning to starting height |
| Chat | Existing manual text sending; explicitly labeled test greeting prefill does not send automatically |

Except stop, actions have at least a five-second interval. They require a complete, sequence-valid own snapshot received within two seconds. Position echoes cannot refresh health/model/snapshot age. A sleeping character must wake and obtain valid new state before movement. Stale states are rejected without reconnecting. Dead characters may stop receiving complete snapshots, so historical death is insufficient for manual respawn.

Steps/jump do not implement map collision, CharacterController, slopes, obstacles, falls, water, vehicles or custom gravity. They are administrator-controlled experiments on verified clear terrain, not validated general-client physics. Corrections, entity changes, unknown own RPCs or scheduler stalls stop the action and may close the connection; guessed positions are not continuously resent to fight corrections.

## API and receipts

Bearer/same-origin `POST /v1/accounts/{id}/rust-action` accepts `{"action":"wake"}`, `{"action":"forward","flatGround":true}` or `{"action":"suicide","confirmDeath":true}`. Allowed actions are wake, respawn, suicide, stop, forward, backward, left, right and jump. Arbitrary commands, coordinates, executables, RPCs and raw datagrams are rejected. The Python input thread validates/queues; native calls remain on the receive thread.

HTTP 202 contains a worker status such as started, sent, stale_state or unsupported_state; inspect it. `serverConfirmed:false` is intentional. Follow the request ID in `metadata.lastAction`; `snapshot_observed` means a new complete own snapshot is consistent with the subsequent state, not an explicit server command receipt, full-jump validation or public eligibility. No match within five seconds becomes unconfirmed. Tickets are not canceled before the worker closes; logs omit coordinates, tickets and chat text.

After the first manual Tick, ordinary parameterless own maintenance RPCs continue. Stopping an action or an unconfirmed result does not stop maintenance; its own timeout closes the connection. Levels0/1 share the codec; EAC and higher levels still stop, with `eacVerified=false`.

## Verification

All 58 Node tests, 45 existing Python tests and12 action tests passed. Coverage includes full/release fields, movement bounds, stale/out-of-order/no-sequence states, death confirmation, fixed respawn, correction-versus-echo, entity replacement, stop/stalls/send failure, level 1, EAC stop and ticket cleanup. Browser checks confirmed disabled movement/death buttons until explicit checks and an idle stop receipt without script errors. No test chat was sent.

At 06:09:06 UTC, one admitted, sleeping, alive account with a fresh complete snapshot was manually woken. The three frames completed and a new awake/alive snapshot produced snapshot_observed; admission and maintenance continued. **Steps, jump, suicide and manual respawn were not live-tested.** No protected EAC session was established.

Loading the Node route/assets required a controlled restart. Exactly the five then-active Rust accounts and their options were preserved/restored; three initially hit rate limits and succeeded with spaced retries. At 06:11:48 UTC the original set matched: five Rust players, 48 Steam accounts, no extras. At 06:11:49 A2S=5, cp=5, Facepunch=0; public Last-Modified06:09:24/Age134. Wake success was not a public-count improvement. Private evidence remains under ignored `work/action-tests/`; no new server DLL is required.
