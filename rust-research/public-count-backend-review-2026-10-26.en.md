# Facepunch public counts: backend boundaries and server leads

Historical review: 2026-10-26. [Original](public-count-backend-review-2026-10-26.md); [complete request/evidence record](public-count-backend-review-2026-10-26.json).

Public counts and public documentation were queried. No private Facepunch backend, acceptance implementation, per-account decision receipt or new verified counting solution was obtained. Public API access was not interpreted as permission to access a private backend, and no administrative login, credential acquisition or exploitation was attempted.

## Direct public response

At 14:44:24 Beijing time, one HTTP 200 response from [playerCounts/rust](https://api.facepunch.com/api/public/steamServers/playerCounts/rust) returned:

| Game endpoint | Public count |
| --- | ---: |
| 61.147.247.25:40176 | 0 |
| 103.91.208.182:16666 | 11 |
| 202.189.21.58:30921 | 7 |

All three keys existed: zero was not absence. `Last-Modified` was 14:39:44, `Age=280`, cache HIT. Body SHA-256 was `3bd3f36cd4981962257ee68297db236878d949036f4e40cda6cb37b287c79676`. The 14:42:20 body had the same hash, so these are not two independent backend batches.

The example server's value 11 is confirmed, but its source cannot be attributed to simulated accounts. The API is only endpoint-to-integer data; it contains no accepted SteamID list, reason, EAC receipt, plugin identity or population provenance.

## What is known and missing

The previously recovered applicable ordinary-list branch uses `max(0, min(cp, FacepunchPublicCount))`, keyed by game connection port. See [query-chain analysis](count-query-reporting-deep-2026-10-24.en.md). Correct local `cp` publication cannot prescribe an independent public source. This round did not inspect the current live browser or revalidate its exact client build.

The missing part is the backend's inputs, account correlation/filtering and publication timing. Successful Steam validation, `OnPlayerConnected`, Rust+ `AppInfo.players`, A2S/cp, a successful upload, player sleep/wake/actions and public inclusion are different observations. No public evidence guarantees that more chat, inputs or a DLL repairs counting; EAC also cannot be declared the unique or sufficient condition without backend evidence.

Valve's [authentication guide](https://partner.steamgames.com/doc/features/auth) and [BeginAuthSession](https://partner.steamgames.com/doc/api/ISteamGameServer#BeginAuthSession) require the asynchronous `ValidateAuthTicketResponse_t` result. Starting validation is not success. Valve explicitly says [BUpdateUserData](https://partner.steamgames.com/doc/api/ISteamGameServer#BUpdateUserData) belongs to the old user-authentication API and should not be mixed with the new API; it is not a missing Facepunch registration endpoint. `CreateUnauthenticatedUserConnection` likewise creates an unauthenticated fake user/bot through the old API. Neither description proves Rust eligibility. Facepunch's server/query-port and tag documentation describes discovery, not per-account acceptance.

## Candidate projects and limits

- `Agude4Rust/Rust-Server-Fake-Player-Count` had size zero and HTTP 409 for commits: no reviewable implementation.
- Selected files from `abspwgm/absolute-rust-server` at `47b318de9db970eab1fb269bda442b4e6dfd1e2c` checked UDP query listening and started Rust Dedicated. Those selected sources were not per-account acceptance logic; the entire repository was not audited or run.
- Facepunch/webrcon issue 28 asked about unauthenticated count access and had no comments. An unanswered question is not an official algorithm.
- [Rust+ review](rustplus-eac-review-2026-10-26.en.md) found an internal-count companion channel, not an EAC/public-acceptance conversion.
- The example server was observed only as aggregate 11. Its roster, configuration, plugin source and normal-versus-independent account comparison were not obtained.

The round made 32 read-only HTTP requests: repository/issue discovery, official documents, selected fixed source and public batches. Exact playerCounts issue search returned zero; broad searches mixed the Rust language and other games, which were excluded. A Facepunch support page returned 403; guessed public article APIs returned 404, and neither was bypassed. Search coverage is finite and does not prove private implementations do not exist. No private endpoint enumeration, ticket/report replay, count modification or EAC generation occurred.

## Useful next evidence

Use one authorized server with reviewable plugin source and normal configuration. Classify official-client and independent connections, record Steam validation, actual EAC state, complete admission and departure, and compare several new public batches while the rest of the roster stays stable. Aggregate deltas still do not identify individual accepted accounts. Prefer official account-level diagnostics or Facepunch explanations if available.

If ordinary official clients are also omitted, assemble genuine version, endpoint, authentication and multi-layer-count evidence for Facepunch support. No ticket or external message was sent in this round. Purchased ownership alone is not documented as a public-count guarantee. The running web service and existing connections were preserved; effective EAC and public-count repair remained unverified.
