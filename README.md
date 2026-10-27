# Rust Server Connection Research and Steam Account Manager

[English](README.md) · [简体中文](README.zh-CN.md)

[Complete English documentation index](docs/ENGLISH_INDEX.md)

A local Node.js application for simultaneous Steam account connections, account and inventory management, and experimental Rust player connections. The repository also contains protocol observations, server diagnostics, and an A2S query proxy for population-reporting experiments.

**Research status, 2026-10-27:** independent player admission and sustained connections have been observed on the specific tested configurations without an EAC requirement. A valid Rust EAC-protected client session and an increase accepted by Facepunch's public server-list population service remain **unresolved**. A modified A2S reply is not evidence that Facepunch counts the added entries as players.

## What works, and what remains unverified

| Capability | Status |
| --- | --- |
| Concurrent Steam logins in one Node.js service | Implemented with `steam-user`, saved-token restoration, and Steam Guard support |
| Account details, game library, inventory, free-license requests, Steam game activity | Implemented; availability also depends on account permissions and Steam responses |
| Independent Rust transport and player admission | Observed on tested configurations using compatible Windows x64 RakNet and Python; not a claim of general server compatibility |
| Persistent connections, global chat, one-shot respawn and wake input | Implemented with state checks; evidence and limitations are recorded separately |
| Walking and jumping | Experimental small movement traces; not a complete game physics implementation or a universally verified gameplay client |
| Facepunch, A2S, `cp`, and optional public player-list comparison | Implemented; each source retains its own result and observation time |
| A2S query reply modification | Implemented; a local test changed `players` from 0 to 2 while preserving `cp=0` |
| Verified public-query routing through the test proxy | Not completed in the recorded experiment |
| Increase in Facepunch's public population | Not verified |
| Valid Rust EAC-protected session from the independent program | Not implemented |

`gamesPlayed()` reports Steam game activity. It does not create a Rust player, satisfy EAC, or prove inclusion in Rust's public server list. Likewise, an Oxide connection hook, an internal active-player count, and a server query reply describe different parts of the system.

## Quick start on Windows

Install Git and Node.js 22 or later, then run:

```powershell
git clone https://github.com/oldboy1026/rust-game-server-fake-player.git
cd rust-game-server-fake-player\steam-multi-account
.\start.cmd
```

The startup script installs the versions locked in `package-lock.json` on first use. Keep the service running, then open `open-dashboard.cmd` or visit [http://127.0.0.1:3210/](http://127.0.0.1:3210/). If the page is locked, read the newly generated local `data/api-key.txt` with the page's key-file control. Account data is created locally; the repository does not supply imported Steam accounts or login tokens.

The [Rust dashboard](http://127.0.0.1:3210/rust) provides account import, connection jobs, per-account events, public population queries, and A2S proxy comparisons. The web interface includes English and Chinese explanations. The [service README](steam-multi-account/README.md) documents setup, API requests, optional native runtime configuration, and operational limits.

Ordinary Steam account management needs no Steam desktop client or Rust installation. Experimental Rust connections additionally require a supported, locally supplied x64 `RakNet.dll` and 64-bit Windows Python 3.10 or later. These are validated before use; game binaries and EAC credentials are not distributed here.

On a different computer, log in again and complete Steam Guard. Windows DPAPI storage is tied to its original user and machine; copying an old data directory is not a portable login mechanism.

## Code and documentation map

| Path | Purpose |
| --- | --- |
| [steam-multi-account/](steam-multi-account/README.md) | Local HTTP service, bilingual dashboard, Node client, Windows scripts, and tests |
| [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md) | Architecture, source-file responsibilities, account/session lifecycle, and extension points |
| [docs/RESEARCH.md](docs/RESEARCH.md) | English research overview, evidence standards, unresolved questions, and next experiments |
| [docs/ENGLISH_INDEX.md](docs/ENGLISH_INDEX.md) | English editions of historical reports, diagnostic tools, and server deployment instructions |
| [rust-research/](rust-research/) | Dated reports and structured evidence; observations apply to the recorded build and configuration |
| [rust-research/protocol-map.json](rust-research/protocol-map.json) | Application messages, connection states, identity fields, and partial Protobuf schema |
| [rust-research/evidence.json](rust-research/evidence.json) | Assembly hashes, manifests, method locations, and static-analysis evidence |
| [rust-research/query-server.mjs](rust-research/query-server.mjs) | A2S query tool using Node.js built-in modules |
| [tools/rust-research/](tools/rust-research/README.en.md) | Protocol probes, offline analysis, captures, and server-diagnostic build tools |
| [server-upload/](server-upload/README.en.md) | Administrator-operated server diagnostics, extension sources, and deployment instructions |
| [HANDOFF.md](HANDOFF.md) | Detailed historical handoff; read current state before resuming any old driver or experiment |

## Population-reporting experiment

The Node.js query proxy reimplements the reply-modification functionality reviewed in [server-query-fake-player-count](https://github.com/anatolykopyl/server-query-fake-player-count). It changes the A2S_INFO player byte and appends explicitly named `[A2S TEST] N` entries to A2S_PLAYER. Original player entries and Rust `cp` tags remain intact. The local dashboard defaults to zero additions and a loopback listener.

The recorded 2026-10-26 experiment returned original A2S `0`, proxied A2S `2`, two test player entries, and `cp=0` on both paths. Facepunch's successfully read public batch did not list the target; absence was recorded as unknown rather than zero. The test did not route the registered public UDP query endpoint through the proxy, so it cannot establish an effect on Facepunch's backend.

See the [integration report](rust-research/query-proxy-integration-2026-10-26.en.md), its [structured results](rust-research/query-proxy-integration-2026-10-26.json), and the [proxy deployment instructions](server-upload/query-proxy/README.en.md). A valid public-path experiment must first demonstrate external queries reaching the registered endpoint through the proxy, then compare distinct Facepunch `Last-Modified` batches and restore the original UDP route. Windows `netsh interface portproxy` forwards TCP, not A2S UDP.

## Research directions

The remaining work is to establish a supported, verifiable Rust EAC client session; understand which population source the relevant browser uses; verify the complete public query/reporting path; and repeat controlled observations with current builds. Steam authentication tickets, Rust transport approval, EAC authentication, and public-count acceptance must be validated separately. The [English research guide](docs/RESEARCH.md) explains the proposed experiments and their acceptance criteria.

Historical captures, raw account data, cookies, authentication tickets, local runtime configuration, downloaded SDKs, and game assemblies belong in ignored local directories. Reports should contain only the metadata needed to reproduce a finding and should distinguish a successful send from server acceptance.

## Run the checks

```powershell
cd steam-multi-account
npm.cmd ci --registry=https://registry.npmjs.org --no-audit --no-fund
npm.cmd test
```

Worker checks can also be run from the repository root with a configured Python installation:

```powershell
python -B tools/rust-research/test_rust_peer.py
python -B tools/rust-research/test_rust_player_tick.py
```

Automated fixtures do not establish live EAC authentication or Facepunch acceptance. The recorded query-proxy integration passed 68 Node.js tests, including 10 proxy tests; later changes should be checked against the current suite rather than treating that historical count as permanent.

## Share a working solution

If you have a verified solution that increases the player count shown in Rust's public server list, or establishes a valid Rust EAC-protected connection, please contact me at **[oldboy1026@gmail.com](mailto:oldboy1026@gmail.com)**. Please share your findings; I may be willing to pay for a working solution.

Useful evidence includes the tested Rust build and server configuration, the distinction between real player connections and query-only entries, reproducible steps, and independent verification of the resulting public count or EAC session. Do not send account passwords, reusable authentication tickets, or private signing credentials.

## License

See [LICENSE](LICENSE) for the project's Apache-2.0 license. Third-party components, game files, and external services retain their own terms and licenses.
