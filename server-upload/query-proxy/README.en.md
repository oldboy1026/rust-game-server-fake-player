# A2S Query Proxy: Deployment and Population Comparison

[English](README.en.md) · [简体中文](README.zh-CN.md)

This Node.js test tool reimplements the query-reply modification functionality of `server-query-fake-player-count`. It changes the A2S_INFO player count and appends `[A2S TEST] N` records to A2S_PLAYER. Original entries and Rust `cp` tags remain intact. Additions default to 0 and are limited to 50.

It handles query traffic only. It creates no Rust player or Steam/EAC session and does not prove Facepunch accepts test entries as valid players. Even a successful direct proxy query requires separate public-path verification and observation of genuinely new Facepunch batches.

## Where to put the files

This is a separate Node.js process, not an Oxide plugin/extension DLL. **Do not put it in `oxide/plugins` or `RustDedicated_Data/Managed`.** Choose a separate server directory such as `D:\RustQueryProxy` and upload the entire generated package, preserving the relative tree:

```text
RustQueryProxy/
  package.json
  README.md
  README.en.md
  README.zh-CN.md
  manifest.json
  tools/rust-research/run-query-proxy.mjs
  steam-multi-account/src/rust-query-proxy.js
  rust-research/query-server.mjs
```

Node.js 22 or later is required. The standalone package needs no npm installation, account data, API keys, `node_modules`, Steam credentials, or game DLLs.

Generate it from the repository root:

```powershell
powershell -NoProfile -File tools/rust-research/Build-QueryProxyPackage.ps1
```

Output is in ignored `work/query-proxy-package-TIMESTAMP`. The builder copies six source/documentation files: three public source files, this English README as both `README.md` and `README.en.md`, and the Chinese README. The English alias keeps the language link usable inside the portable package. It generates the `type: module` package configuration and SHA-256 manifest. It does not run the proxy, change networking, or restart Rust.

## First compare locally

From the uploaded package root, assuming original same-host Rust query port 40177 and game port 40176:

```powershell
node tools/rust-research/run-query-proxy.mjs --host 127.0.0.1 --game-port 40176 --query-port 40177 --listen-port 42177 --add-players 0 --duration-seconds 300
```

The listener is `127.0.0.1:42177`. Confirm the original and zero-addition paths agree. After stopping, start a one-entry comparison:

```powershell
node tools/rust-research/run-query-proxy.mjs --host 127.0.0.1 --game-port 40176 --query-port 40177 --listen-port 42177 --add-players 1 --duration-seconds 300
```

In another terminal, query original and proxy INFO using the packaged tool; these commands also request RULES:

```powershell
node rust-research/query-server.mjs --host 127.0.0.1 --port 40177
node rust-research/query-server.mjs --host 127.0.0.1 --port 42177
```

Counts are bounded by INFO's maximum and the A2S byte limit. Compressed split replies are unsupported and produce an upstream error; ordinary split replies are reassembled. Default duration is 300 seconds, allowed range 10-900, and Ctrl+C stops early. Logs contain configuration, aggregate counters, and error categories, not real player names or querying-client addresses.

## Dashboard and API

Unlock the local management page and open the A2S proxy panel at `/rust`. It provides start, stop, status, and a three-source comparison. This API creates only a loopback listener and is suited to original/proxied A2S versus Facepunch comparison.

Existing Bearer authentication and same-origin restrictions apply:

```text
GET    /v1/rust/query-proxy
POST   /v1/rust/query-proxy
DELETE /v1/rust/query-proxy
POST   /v1/rust/query-proxy/sample
```

Start body:

```json
{"host":"127.0.0.1","gamePort":40176,"queryPort":40177,"listenPort":42177,"addPlayers":1}
```

Sample body is `{}`. Results include both A2S counts/`cp`, Facepunch count, and public cache metadata. Facepunch lookup uses the configured game endpoint; the example loopback address is illustrative and must be replaced by the actual public IPv4 for public data. `publicPathVerified: false` means this API has not proved public traffic passes through the proxy.

## Public query routing is a separate deployment task

A new 42177 listener does not change Steam's registered query endpoint or cause Facepunch to query it. Before editing a port, record the game endpoint, actual registered query endpoint, Rust listener, host/NAT UDP mapping, and concrete rollback settings.

An explicitly requested bounded public listener can be started with:

```powershell
node tools/rust-research/run-query-proxy.mjs --host 127.0.0.1 --game-port 40176 --query-port 40177 --listen-host 0.0.0.0 --listen-port 42177 --add-players 1 --duration-seconds 300 --public-test
```

This creates a listener only: no firewall rule, UDP forwarding, or Steam registration change. Listener and upstream query ports must differ. **Windows `netsh interface portproxy` is TCP-only and cannot take over A2S UDP.** Public routing depends on the actual hosting panel, NAT, and UDP forwarding support; do not apply commands invented for an unknown topology.

During a maintenance window:

1. Save original INFO/PLAYER, `cp`, genuine game connection counts, Facepunch count, `Last-Modified`, and `Age`; confirm the registered query endpoint.
2. Start with zero additions. Arrange a reversible path through the proxy from the same registered public query endpoint to a distinct original query endpoint. Two processes must not compete for a port occupied by the game. Whether configuration/restart is needed depends on the actual deployment; this tool does not do it. Recheck registration after changing the original listener so it does not bypass the proxy.
3. Query the registered endpoint from outside the server host. Confirm increasing proxy request counters and the correct Rust/game-port identity. Success against a temporary unregistered port is insufficient.
4. After passthrough works, add one entry for a bounded interval and confirm the external INFO/PLAYER difference while genuine connections and `cp` stay unchanged.
5. Observe new Facepunch `Last-Modified` batches. Repeated cached reads and the proxy's own output are not proof of backend acceptance. The public interface is aggregate and does not identify accepted accounts.
6. Stop the proxy, restore the saved original UDP route/configuration immediately, and verify the original public query works. **Expiry stops only this process; it does not undo an external UDP mapping.** A mapping still pointing at a stopped proxy will interrupt queries.

Without a controllable UDP entry point or the needed maintenance window, only local comparisons can be completed. One unchanged new batch alone does not expose Facepunch's internal rule. Record the actual result and do not label a changed proxy reply as a repaired public count.
