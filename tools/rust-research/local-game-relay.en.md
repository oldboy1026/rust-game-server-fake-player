# Local UDP Relay Observation for an Official Client

[English](local-game-relay.en.md) · [简体中文](local-game-relay.md)

`observe-local-game-relay.mjs` relays a running ordinary Rust client's local UDP traffic while recording direction, time, size, and first byte. It does not log into Steam, create a player, or interpret Rust/Steam/EAC payloads. On 2026-10-24 an official local client entered a local server's world through this relay and the server observed Players 1. See `rust-research/local-test-server-observation-2026-10-24.json`; this single compatibility observation does not guarantee other builds or security settings.

That observation preceded lifecycle corrections. The source was subsequently changed to bind the frontend before allocating the random upstream port, recheck deadlines after synchronous metadata writes and before sends, and set `socketsClosed` from actual socket-close outcomes. Close errors produce exit code 1. Already stopped sockets count as closed; other close errors stop forwarding and unref the socket. The corrected version passed Node syntax checks only; the network experiment was not repeated.

## Run

First confirm a local test server listens on `127.0.0.1:20090`, then run from the repository root:

```powershell
node tools/rust-research/observe-local-game-relay.mjs --seconds 300
```

The only optional argument is `--seconds`, an integer 10-600, default 120. Timing starts at initialization. After a JSON `type: "ready"`, connect the official client through its game console:

```text
client.connect 127.0.0.1:20093
```

Frontend binding is fixed `127.0.0.1:20093`. A separate UDP socket binds a random local port and connects to fixed `127.0.0.1:20090`. Complete datagram bytes are relayed unchanged in both directions, including headers, payloads, and authentication messages. Separate socket ports avoid making the client destination and relay upstream address identical.

Only IPv4 loopback is accepted. The first valid packet locks one client source port for the run; other client ports are dropped. A reconnect with a new source port requires ending/restarting the relay. Remote servers, multiple clients, and configurable ports are not supported.

## Records and stop

Each run creates a unique ignored `work/local-game-relay-*` directory:

| File | Content |
| --- | --- |
| `metadata.jsonl` | Per-packet direction, UTC `at`, relative `elapsedMs`, byte `length`, and numeric `firstByte`; empty datagrams use null |
| `summary.json` | Start/end, stop reason, per-direction packets/bytes, send callback counts, rejected counts, and write state |

Directions are `client_to_server` and `server_to_client`. It retains no complete payload, account information, tickets, player/entity IDs, or random client port. Metadata is limited to 16 MiB. Reaching the limit, write failure, socket error, deadline, Ctrl+C, or termination signal stops further forwarding, requests both sockets close, and writes the summary. Synchronous metadata writing occurs before forwarding and can add latency.

`forwardedPackets/forwardedBytes` mean the UDP send callback reported no error, not that the peer received or accepted the datagram. A first byte alone cannot establish Rust application type, decryption, initialization, or EAC authentication.

**Stopping the relay cuts forwarding for the ordinary client connected through 20093; the game later times that connection out.** Direct connections to 20090 are unaffected. Confirm actual departure using server state/client behavior rather than treating relay exit as the player's departure time.

Stdout contains only readiness and summary JSON. Argument/initialization errors add generic usage information to stderr. Local observation data stays in ignored `work/`; raw data is not committed.
