# Steam Multi-Account Service

[English](README.md) · [简体中文](README.zh-CN.md) · [Project overview](../README.md)

A single Node.js service maintains separate Steam CM connections for multiple accounts in one Windows user session, using `steam-user`. A local HTTP API and bilingual web dashboard manage login, account features, and experimental Rust connections. The [code guide](../docs/CODE_GUIDE.md) explains the implementation; the [research guide](../docs/RESEARCH.md) separates completed work from open questions.

## Start the service and add accounts

Use Node.js 22 or later. On first use, `start.cmd` installs the dependencies pinned in `package-lock.json`. You can also install them explicitly:

```powershell
npm.cmd ci --registry=https://registry.npmjs.org --no-audit --no-fund
```

1. Run `start.cmd`, or run `npm.cmd start` from this directory. Keep the service running.
2. Open `open-dashboard.cmd`. Add an account, provide Steam Guard when required, and manage its connection.

You can visit [http://127.0.0.1:3210/](http://127.0.0.1:3210/) directly. On first access, paste the local `data/api-key.txt` value or use the page's key-file control to select that file. The key stays in the current tab's session storage. Locking or closing the page does not log out the service's Steam connections.

No imported accounts, passwords, saved refresh tokens, or API keys are supplied by the repository. Enter your own accounts locally. Windows DPAPI storage is tied to its original computer and Windows user; log in again when moving to a different environment.

## Rust dashboard

Open [http://127.0.0.1:3210/rust](http://127.0.0.1:3210/rust), or use the Rust navigation link. The page displays Steam login names and handles internal management IDs itself.

### Public population queries

The public-server query is independent of account selection and Steam login. Enter an IPv4 address and the **game port**. Leave the query port blank to find an exact match in Steam's server registration; if discovery fails, enter the actual query port. The public query does not guess adjacent ports.

The result distinguishes Facepunch's public population, the server's `cp` tag, A2S players/bots, and optional A2S_PLAYER entries. Facepunch returns aggregate counts, not a verified per-account roster. A2S player entries come from the server, may be empty or restricted, and do not provide a verifiable SteamID. A missing public mapping remains unknown rather than being converted to zero.

The page retains `Last-Modified`, `Age`, and observation time. The public map is locally cached for 30 seconds, concurrent fetches are combined, and queries run on demand rather than with the account-status polling loop.

`POST /v1/rust/server-query` uses the existing local Bearer and same-origin checks. Example:

```json
{"host":"127.0.0.1","port":28015,"queryPort":28017,"includePlayers":true}
```

`queryPort` and `includePlayers` are optional. Replace the loopback address with the actual public game-server IPv4 when querying Facepunch. Each source reports its own status, so one failure need not hide the other results. Account tickets are never sent to the public count API. Administrator-operated diagnostic files are documented under [server-upload/](../server-upload/README.en.md).

### A2S query proxy

The query-proxy panel integrates the reply-modification functionality reviewed in `server-query-fake-player-count`: compare original A2S, A2S with added `[A2S TEST]` entries, and Facepunch's public population while preserving the original `cp` tag. The local API permits only a loopback listener and defaults to zero additions.

Use `/v1/rust/query-proxy` to start, stop, or read proxy status, and `/v1/rust/query-proxy/sample` to collect the comparison. Starting a local proxy does not take over a remote public query endpoint, create a Rust player, or establish EAC. See the [deployment instructions](../server-upload/query-proxy/README.en.md) and [integration evidence](../rust-research/query-proxy-integration-2026-10-26.en.md).

### Import, connect, and review events

- Import one `account:password` pair per line, up to 200 per job. Passwords can contain colons. The input is cleared immediately after submission; plaintext passwords are not retained in account storage, job results, or account event logs.
- A newly imported account that requires Steam Guard, fails, or times out is stopped and removed by the import workflow. Existing account records and existing online sessions are retained. Submit Guard codes through the ordinary account login page, not the batch-import form.
- Select accounts to log into Steam, connect to a game IPv4 and game port, or disconnect. This connection form accepts an optional query port and otherwise defaults to game port plus one; this is separate from the public-query form's exact registration discovery. Connections are spaced out, and already active Rust sessions are skipped.
- Server groups show the name and this application's connected/connecting account counts. Names are read using A2S; failures fall back to the endpoint. These local counts are not Rust's public population.
- Each account has up to 200 recent events. Jobs and event logs are in service memory and reset when the service restarts. Steam logins restore according to their saved preference; Rust sessions must be started again explicitly.
- An admitted account can send a single ordinary global chat message with a minimum five-second interval. Text is limited to 128 characters/512 UTF-8 bytes on one line; double quotes, backslashes, semicolons, and control characters are rejected. Message bodies are not retained in the local connection log.

`POST /v1/accounts/{id}/rust-chat` accepts `{"text":"connection test"}`. HTTP 202 with `status: sent_to_transport` means the native send was invoked; `serverConfirmed` remains false. Confirm reception using the game or server chat records. The route returns 409 when not ready, 429 when rate limited, and 504 when waiting for a result times out. A timed-out result is unknown and is not automatically retried. Pending requests end when the worker closes. The Steam ticket is canceled and cleared only after the network worker has fully exited.

The one-shot respawn option is off by default. It requires an observed own-player death snapshot and completed loading. Admission, being alive, and inclusion in a public list are separate observations. The current connection implementation stops at an EAC requirement or unsupported protected encryption.

The role-actions dialog also exposes wake, respawn, stop, suicide, short steps, and jump. Suicide requires `confirmDeath: true`; movement and jump require administrator confirmation of flat, unobstructed test ground through `flatGround: true`. The movement traces do not implement terrain, collision, or complete client physics. A 202 response is acceptance of the request, not proof that an action succeeded. See [player-action evidence](../rust-research/player-actions-2026-10-26.en.md).

## Account details, inventory, free licenses, and Steam game activity

Open the account-details view from an account card:

- **Profile:** nickname, avatar, Steam level, country, partially masked email, wallet balance, authorized-device and license information, account restrictions, community bans, and VAC status. Some values arrive asynchronously and remain pending until Steam supplies them.
- **Library:** readable games, AppIDs, lifetime/two-week playtime, search, and shortcuts to report a selected game as being played. Privacy and Steam's responses can affect the list.
- **Inventory:** presets for Steam Community items, CS2, Dota 2, and TF2, plus custom AppID and ContextID. Results include images, names, types, quantities, trade/market flags, descriptions, and pagination. A ready web session is required; permission and network failures are reported independently.
- **Free licenses:** search the Steam Store or enter an AppID/free-package SubID. AppIDs use the free-on-demand license API; SubIDs use the Store's free-package claim endpoint. Ownership, region, promotion eligibility, and license type affect the result. The UI distinguishes new grants, no new grant, and errors. Each account is limited to 40 requested licenses per hour and at least three seconds between requests.
- **Steam game activity:** set one or more AppIDs, update them, or stop. Settings are encrypted and restored on reconnect/service restart. If the account plays elsewhere, this service pauses and later resumes without forcing that other game session to end. Steam determines actual recorded playtime; appropriate game ownership is still required.

Profile refresh requests nickname, avatar, and level again. Web-session refresh regenerates the session used by inventory and Store calls; allow a few seconds before retrying inventory.

Profile, library, inventory, and web cookies are cached only in memory. Cookies are not returned by the local API, and email is masked by default. Saved Steam activity settings share the encrypted account store with login tokens.

## PowerShell client

Open another PowerShell window in this directory:

```powershell
# Prompts for account name, hidden password, and Steam Guard if required.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 login account1

# The first account keeps its independent connection.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 login account2

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 list

# Reconnect using the saved token.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 connect account1

# Log out and disable automatic restoration, retaining the saved token.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 logout account1

# Disconnect and delete this service's local account record and tokens.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 remove account1

# Shut down while retaining saved restoration preferences.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 stop
```

`account1` and `account2` are internal IDs for the script/API, not Steam account names. The browser handles those IDs automatically. `state: online` means the account logged in and the service set its Steam persona online. Active saved logins restore with refresh tokens after restart; an explicitly logged-out account stays offline until reconnected.

## HTTP API

The default base URL is `http://127.0.0.1:3210`. All `/v1/` requests require:

```text
Authorization: Bearer <contents of the local data/api-key.txt>
Content-Type: application/json
```

| Method | Path | JSON body | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | None | Unauthenticated health check |
| GET | `/` | None | Account dashboard; actions require the local API key |
| GET | `/rust` | None | Rust dashboard |
| GET | `/v1/rust/overview` | None | Accounts, local server groups/counts, and recent jobs |
| POST | `/v1/rust/import` | `{"text":"account:password\nsecond:password"}` | Create import/login job; returns 202 |
| POST | `/v1/rust/actions` | `{"action":"login","accountIds":["account1"]}` | Batch `login`, `connect`, or `disconnect` |
| GET | `/v1/rust/jobs/{job}` | None | Per-account results for a batch job |
| GET | `/v1/rust/accounts/{id}/logs` | None | In-memory per-account events |
| POST | `/v1/rust/server-query` | `{"host":"127.0.0.1","port":28015}` | Compare public/A2S sources; optional query port and player list |
| GET | `/v1/rust/query-proxy` | None | A2S proxy state |
| POST | `/v1/rust/query-proxy` | `{"host":"127.0.0.1","gamePort":28015,"queryPort":28017,"listenPort":42177,"addPlayers":0}` | Start loopback query proxy |
| DELETE | `/v1/rust/query-proxy` | None | Stop proxy and release UDP sockets |
| POST | `/v1/rust/query-proxy/sample` | `{}` | Original/proxy/Facepunch comparison |
| POST | `/v1/service/shutdown` | `{}` | Stop service, preserving restoration preferences |
| GET | `/v1/accounts` | None | List account states |
| GET | `/v1/accounts/{id}` | None | Read one account's state |
| POST | `/v1/accounts/{id}/login` | `{"accountName":"name","password":"password"}` | Start credential login |
| POST | `/v1/accounts/{id}/login` | `{}` | Log in with the saved token |
| POST | `/v1/accounts/{id}/guard` | `{"code":"ABCDE"}` | Submit the currently requested Steam Guard code |
| POST | `/v1/accounts/{id}/logout` | `{}` | Log out and disable restoration |
| DELETE | `/v1/accounts/{id}` | None | Disconnect and delete saved account information |
| GET | `/v1/accounts/{id}/details` | None | Profile, web/Steam activity state, and current-session claim results |
| POST | `/v1/accounts/{id}/profile-refresh` | `{}` | Refresh nickname, avatar, and level |
| POST | `/v1/accounts/{id}/web-refresh` | `{}` | Request a new Steam web session |
| GET | `/v1/accounts/{id}/games` | None | Library; `?refresh=1` forces refresh |
| GET | `/v1/accounts/{id}/inventory` | None | Inventory with the query parameters below |
| GET | `/v1/free-games` | None | Store search; query parameters `term` and `start` |
| POST | `/v1/accounts/{id}/free-license` | `{"appIds":[570]}` or `{"packageId":123}` | Request free app/package licenses |
| POST | `/v1/accounts/{id}/idle` | `{"appIds":[570,730]}` | Set Steam activity; an empty array stops it |
| POST | `/v1/accounts/{id}/rust-auth-check` | `{}` | Request/cancel a Rust Steam ticket and check ownership/encrypted-ticket issuance |
| POST | `/v1/accounts/{id}/rust-connect` | `{"host":"127.0.0.1","port":28015,"seconds":60}` | Bounded Rust connection probe |
| POST | `/v1/accounts/{id}/rust-session` | `{"host":"127.0.0.1","port":28015}` | Start persistent Rust connection; returns 202 |
| GET | `/v1/accounts/{id}/rust-session` | None | Session progress, safe metadata, and Steam ticket observations |
| DELETE | `/v1/accounts/{id}/rust-session` | None | Gracefully disconnect the Rust session |
| POST | `/v1/accounts/{id}/rust-chat` | `{"text":"connection test"}` | Send one ordinary global chat message through an admitted connection |
| POST | `/v1/accounts/{id}/rust-action` | `{"action":"wake"}` | Fixed role action; additional confirmations apply to death/movement |
| GET | `/v1/accounts/{id}/rust-steam-count` | None | Query Steam GMS/server-list count sources for the selected endpoint |

Inventory parameters: `appId` defaults to 753, `contextId` to `6`; supply the previous `nextAssetId` as `startAssetId`. `refresh=1` forces refresh. Up to 100 items are returned per page. Free-game search returns `nextStart` for the next `start`, or null when complete.

`login` and `guard` return **202 Accepted**. Poll until the state becomes `online`, `guard_required`, or `error`. Login can also include `authCode` for email or `twoFactorCode` for the mobile authenticator.

Batch `connect` additionally requires `target: {host, port, queryPort?}`. Optional `respawnOnDead` and `wakeOnConnect` must be booleans. Batch selection permits 1-200 accounts. Import has a 128 KiB JSON limit; ordinary requests have a 16 KiB limit, with smaller limits on chat/action routes. A `started` result records initiation, not completed admission; check the overview. Job and Guard errors do not return the original password line.

A Guard-required state can look like:

```json
{
  "id": "account1",
  "state": "guard_required",
  "guard": {
    "type": "totp",
    "emailDomain": null,
    "lastCodeWrong": false,
    "retryAfterSeconds": 0
  }
}
```

Use an emailed code for `email`, or the five-character mobile authenticator code for `totp`. After a wrong mobile code, wait `retryAfterSeconds`, then obtain a fresh code.

| Steam state | Meaning |
| --- | --- |
| `offline` | No current connection |
| `connecting` | Login in progress |
| `guard_required` | Waiting for Steam Guard |
| `online` | Logged in with online persona set |
| `reconnecting` | `steam-user` is reconnecting after interruption |
| `error` | Terminal login/connection error; inspect `lastError` before retrying |

Common HTTP errors are 400 invalid input, 401 invalid API key, 404 missing resource/account, 409 state conflict or duplicate account, 429 cooldown/concurrency limit, 500 local storage/service error, and 504 operation timeout. The local server also rejects unexpected Host headers and browser cross-origin requests.

### Steam ticket check

`rust-auth-check` is fixed to AppID `252490`. The account must be online. An existing active Rust ticket prevents another check; same-account checks are serialized, and encrypted-ticket attempts are spaced by at least 60 seconds.

Results contain only statuses, lengths, AppID, signature checks, and cancellation counts. Tickets stay in memory and are cleared after cleanup; they are not returned or logged. This check does not change Steam activity or connect to the game server. `serverValidated`, `eacVerified`, and `playerConnected` remain false. Success means ticket issuance and cancellation were observed, not that a Rust server accepted the ticket. After 70 seconds the request can return 504 while underlying cleanup continues; another check remains blocked until it finishes.

## Use the Node.js HTTP client

`client.js` can be imported by another local Node.js program. Start the service first:

```javascript
import { SteamAccountsApi } from './client.js';

const api = new SteamAccountsApi(); // Reads the local data/api-key.txt.

// Obtain these values from your own interactive input or credential manager.
await api.login('account1', { accountName, password });
await api.login('account2', {
  accountName: secondAccountName,
  password: secondPassword,
});

const account = await api.status('account1');
if (account.state === 'guard_required') {
  // Use the current user-provided code. If lastCodeWrong, first wait
  // retryAfterSeconds and obtain a fresh code.
  await api.submitGuard('account1', code);
}

console.log(await api.list());
console.log(await api.details('account1'));
console.log(await api.games('account1'));
console.log(await api.inventory('account1', { appId: 753, contextId: '6' }));
console.log(await api.freeGames('Dota'));

// State-changing examples: invoke only when desired.
// await api.claimFreeGames('account1', [570]);
// await api.claimFreePackage('account1', knownFreePackageSubId);
// await api.startIdling('account1', [570]);
// await api.stopIdling('account1');
// await api.logout('account1');
// await api.login('account1'); // Reuse saved token.
// await api.remove('account1');
```

Poll `status` after login, for example every two seconds; Guard may be requested after the initial call. The generic `api.request(method, path, body)` covers routes without dedicated client methods. Its default request timeout is 15 seconds; a bounded `rust-connect` call can take longer and requires an HTTP caller with an appropriately larger timeout.

## Saved data and runtime configuration

The service creates the ignored `data/` directory on first start:

| File | Purpose |
| --- | --- |
| `accounts.enc` | AES-256-GCM encrypted account records, refresh tokens, machine-authentication data, and saved Steam activity settings; no plaintext passwords or Guard codes |
| `key.dpapi` | Encryption key protected by Windows DPAPI for the current user and machine |
| `api-key.txt` | Randomly generated local HTTP API key |
| `service.lock` | Prevents two service processes from sharing one data directory; normal exit removes it, and stale locks are checked against the recorded process |
| `rust-runtime.json` | Optional local native-runtime paths and supported DLL hash |

Protect the entire directory. DPAPI prevents direct key-file reading from revealing the account encryption key; another program running as the same Windows user can still request decryption. Other operating systems use a local key file with mode `0600`.

Set environment variables before starting the service:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3210` | HTTP port; binding remains `127.0.0.1` |
| `STEAM_DATA_DIR` | This application's `data` directory | Local data path; an absolute path is recommended |
| `STEAM_WEB_COMPAT` | `1` | Steam WebSocket on port 443; `0` uses the library's default transport selection |
| `STEAM_CM_PROXY` | `auto` | Reuse configured HTTP/system proxy for Steam CM; `direct` makes CM direct |
| `STEAM_HTTP_PROXY` | Auto-detected | HTTP/HTTPS proxy for inventory, Store, and default CM connections; `direct` disables it |
| `RUST_NATIVE_DLL` | None | Absolute path to an inspected Windows x64 RakNet DLL |
| `RUST_NATIVE_SHA256` | Client-build hash when not otherwise supplied | Hash corresponding to an explicitly supplied native DLL |
| `RUST_PYTHON` | None | Absolute path to a 64-bit Windows Python executable |

Proxy selection checks `STEAM_HTTP_PROXY`, then `HTTPS_PROXY`/`HTTP_PROXY`, then enabled Windows static proxy settings. `STEAM_HTTP_PROXY=direct` disables this configuration; `STEAM_CM_PROXY=direct` changes only CM routing. Rust UDP transport uses its own network path. Restart the service after changing startup environment values.

For a different HTTP port, pass `-BaseUrl http://127.0.0.1:PORT` to the PowerShell client or `{ baseUrl: 'http://127.0.0.1:PORT' }` to the Node client.

Temporary network interruptions use library reconnection. Terminal errors such as invalid credentials, revoked tokens, or replaced logon sessions become `error` rather than an infinite authentication retry loop. Renewed tokens are saved automatically where possible; revoked/expired credentials can require a fresh password and Steam Guard. The computer, network, and service process must stay available.

## Independent Rust connection research

### Transport, identity, and persistent sessions

`POST /v1/accounts/{id}/rust-connect` accepts `{"host":"127.0.0.1","port":28015,"seconds":60}`. The account must be online and the native runtime must be configured. Duration is 5-120 seconds. The route waits for the bounded connection and ticket cleanup, then returns stages, message counts, and fixed rejection categories. The ticket reaches the network worker through an anonymous local stdin pipe, not API output, command-line arguments, or disk.

The service obtains a fresh Steam session ticket. After a Rust identity request, the worker submits the account identity. Approval with encryption level 0 or level 1 permits the version-checked minimal Ready message. Level 1 is protocol-2635 XOR obfuscation, not EAC authentication. EAC messages or levels greater than 1 stop the worker.

`approved`, `readySent`, and `worldMessages` describe distinct stages. `playerConnected` is true only after observing both this account's own player entity and the precise FinishLoading RPC addressed to it. `eacVerified` remains false.

Persistent connections use `POST /v1/accounts/{id}/rust-session` with `{"host":"127.0.0.1","port":28015}` and return 202 immediately. `GET` reads state, and `DELETE` disconnects gracefully. `entered_game` records own-entity and FinishLoading confirmation. Closing the browser leaves the service connection running; stopping the service or logging the Steam account out ends it. Persistent Rust sessions do not restore automatically on restart.

### Native runtime setup

Store local configuration in ignored `data/rust-runtime.json`:

```json
{"dll":"C:\\path\\to\\RakNet.dll","python":"C:\\path\\to\\python.exe","sha256":"supported DLL SHA-256"}
```

Environment overrides take precedence. On a new computer, configure that computer's paths rather than copying another machine's paths. Alternatively:

```powershell
node scripts/configure-rust-runtime.mjs --dll "C:\path\to\RakNet.dll" --python "C:\path\to\python.exe"
```

The script validates a supported DLL hash and Python 3.10+ with a 64-bit interpreter before saving the actual paths/hash. If `--python` is omitted, it checks `RUST_PYTHON` and a locally available bundled runtime. The supported native libraries are transport DLLs, not Oxide extensions:

| Inspected source | SHA-256 |
| --- | --- |
| Client `RustClient_Data/Plugins/x86_64/RakNet.dll` | `5bd99d127e7453bf04793681bf8e6e25db8abebe16f9f15583da34807ed1aa44` |
| Dedicated-server depot 258551, manifest 93946663446561466, `RustDedicated_Data/Plugins/x86_64/RakNet.dll` | `a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21` |

Both client-facing transport ABIs were inspected; ABI compatibility does not provide an EAC session. See [runtime-repair evidence](../rust-research/runtime-repair-2026-10-26.en.md). When configuring the second library through the environment, supply `RUST_NATIVE_DLL`, `RUST_PYTHON`, and `RUST_NATIVE_SHA256` together. Overriding a DLL path does not inherit another saved path's hash. Old saved settings without a hash use the original client hash.

The worker checks the complete DLL hash and x64 PE format before loading. Saved runtime settings are read at each new connection, so correcting those settings needs no service restart; backend code changes do. Missing or unsupported runtime configuration produces a specific local error before requesting admission tickets or launching a network worker. It is not a game-server rejection or an EAC failure.

### Optional one-shot respawn

`respawnOnDead` must be a boolean and defaults to false. When true, the worker attempts one fixed ordinary `respawn` request only after the same own entity's exact FinishLoading, a complete own snapshot no older than ten seconds, and `lifeState=dead`. A changed own entity clears the old FinishLoading gate. A failed send is not retried. The server still enforces death state and cooldown.

This option itself sends no PlayerTick, wake, or movement input and does not change the stop-at-EAC behavior. The UI defaults the checkbox off and locks the actual setting during a session. A pending choice applies to the next connection and is not overwritten by status polling. Finished sessions label their old role snapshots as historical.

`respawnOnDeadEnabled`, `respawnAttempted`, and `respawnSent` distinguish configuration, attempt, and native-send result. `respawnAliveObserved` becomes true only after a later complete alive snapshot for the same entity, with `respawnAliveAfterSeconds`. This is a post-send observation, not a command acknowledgment, causal proof, or proof of public-list acceptance.

### Optional one-shot wake and connection maintenance

`wakeOnConnect` must be a boolean and defaults to false. Example: `{"host":"127.0.0.1","port":28015,"wakeOnConnect":true}`. The worker CLI equivalent is `--wake-on-connect`. Updating backend code requires a restart to accept new options; old running sessions do not gain them automatically.

Wake requires approved encryption level 0/1, FinishLoading for the same own entity, a complete ordered own snapshot no older than two seconds, positive health and alive state, and suitable connected/loading/spectator/wounded/transfer flags. Initial support additionally requires a grounded, stationary state without a parent, mount, water, or special movement posture. Position, view, and model fields come from the observed own snapshot, with standing/crouching eye placement for an unparented player. Unsupported states wait for another snapshot instead of guessing coordinates or using administrator wake commands.

An attempt sends at most three full frames, designed 50 ms apart: neutral, crouch button `64`, then neutral release, on reliable ordered channel 0. Every Tick/Input/ModelState/vector component is explicitly written, including zero values, to replace stale ProtoDelta state. The active item is put away and no attack is sent. Unknown own RPCs, destruction, real movement, or changed base flags invalidate retained state. Inspected UI/pet metadata RPCs and unchanged-position synchronization can continue; view-only updates do not refresh complete-state age. If a pressed input cannot safely be released, or a send fails, that account's connection closes without retrying.

The first Tick starts server responsiveness timing. Once a wake Tick is sent, the worker separately sends the ordinary parameterless owner RPC `ClientKeepConnectionAlive`, designed at 100 ms intervals, independently of wake success/interruption. It does not loop old coordinates or input frames. On the inspected target, `server.playertimeout=60`, and RPC reception first applies `antihack.rpcstallthreshold=0.8`; a two-second maintenance interval was insufficient. A local maintenance gap over 500 ms closes the account connection instead of burst-catching up or changing server thresholds. Native-send failure also closes it. Custom server thresholds or network/scheduler stalls can still disconnect the session.

Metadata separates `tickWakeEnabled`, `tickPacketsSent`, `wakeAttempted`, `wakePressSent`, `wakeReleaseSent`, `wakeAwakeObserved`, and `wakeState`. Wake is observed only when a later ordered, usable complete same-entity snapshot clears Sleeping within five seconds after the press; `awake_observed` also requires the release frame to have been sent. Three sends without confirmation become `awaiting_confirmation`, then `unconfirmed`. Neither native send nor a later snapshot proves causation or public population acceptance. Coordinates, entity IDs, full flags, and input contents are omitted from the state API.

### Own-state observations and Steam authentication association

`metadata.ownPlayerState` summarizes the account's complete entity snapshot: `observed`, `sleeping`, `receivingSnapshot`, `lifeState` (`alive`/`dead`/`unknown`), `healthPositive` (boolean/null), spectator/wounded/connection/transfer flags, field-presence flags, snapshot/state-change counters, and `ageSeconds`. Unknown stays unknown. Sleeping=false alone does not prove alive or fully awake. `entered_game` confirms an earlier admission stage, not a permanently fresh state.

Age is measured at the worker sample; parse failure retains the previous observation while its age increases. `entityParseFailures` counts parse failures across all Entity messages. Diagnostics omit player IDs, coordinates, numeric health, and raw flag values, and do not themselves send input. Ordered complete snapshots are required for guarded action paths; arbitrary old snapshots must not be treated as fresh server state.

Persistent sessions report Rust game activity, adding the actual server address after transport connection and restoring saved Steam activity after cleanup. Activity reporting still pauses for an external game session. This does not guarantee an external/public player-count update.

`src/rust-auth-association.js` is an experimental research module, not part of routine web sessions. It relates the exclusively owned active ticket's AppID, CRC, GC token, Steam connection generation, successful `authTicketStatus`, and just-queried target game-server identity. Only a genuinely admitted session can supply activity data with the exact `steam_id_gs`; cancellation, mismatched identity, or generation changes invalidate the association. The module observes/constructs data but does not itself send activity or authentication requests.

A 2026-10-25 single-account 6/11/6-minute comparison kept a real roster/`cp` of 14 during the association phase while two newer public batches stayed at 3. No public-count increase was observed; natural player changes also occurred during restoration. This candidate is not a validated fix. See [the experiment](../rust-research/presence-association-experiment-2026-10-25.en.md).

`GET .../rust-session` returns safe `steamAuthentication` activity/validation observations without tickets or identity fields. `GET .../rust-steam-count` queries GMS authentication counts for the most recently selected address and separately retains the result of `GameServers.GetServerList`; that API's `players` is not guaranteed to mean authenticated players. Missing/failed sources remain unknown. Steam GMS, Steam list players, A2S, `cp`, and Facepunch public population are distinct sources.

Historical tests observed the own entity, FinishLoading, sustained connections, and later Sleeping clearance after one wake sequence on the recorded configurations. They do not establish valid Rust EAC or universal/permanent admission. EAC messages and encryption levels above 1 still stop the worker. An official Steam/Rust client remained running as an observation baseline in earlier tests; repeating with both fully closed remains a separate experiment. This program does not call their session or IPC.

## Validation and dependencies

From this directory:

```powershell
npm.cmd test
```

The Node suite uses simulated Steam clients to test concurrent accounts, Guard, reconnect state, token restoration, HTTP authentication, encrypted storage, account features, and query behavior. It does not submit real account passwords, claim live licenses, or change live Steam activity.

From the repository root:

```powershell
python -B tools/rust-research/test_rust_player_tick.py
python -B tools/rust-research/test_rust_peer.py
```

With .NET 10 and a locally supplied matching Rust server, `tools/rust-research/Test-PlayerTickInterop.ps1 -ServerDirectory <Rust-server-directory>` checks the three frames against the real Rust.Data decoder, including replacement of nonzero baseline values and full reserialization. Its generated files stay in ignored `work/`; it does not launch the game or establish a network connection.

A wake sequence followed by Sleeping clearance was observed on 2026-10-25. See [connection-maintenance regression evidence](../rust-research/connection-timeout-fix-2026-10-25.en.md). The [public-count survey](../rust-research/public-count-web-survey-2026-10-25.en.md) explains why GameDig `cp`, BattleMetrics, and Steam list counts cannot substitute for Facepunch acceptance.

The main upstream dependency is [steam-user 5.3.0](https://github.com/DoctorMcKay/node-steam-user). All package versions are pinned by `package-lock.json`; reinstall with `npm.cmd ci --registry=https://registry.npmjs.org`.
