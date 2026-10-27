# Source review: server-query-fake-player-count

Historical review: 2026-10-26. [Original](query-fake-player-count-review-2026-10-26.md); [URLs, hashes and evidence](query-fake-player-count-review-2026-10-26.json).

The supplied project is a Steam/A2S UDP reply proxy. It does not implement Steam account login, Rust player admission, a valid EAC session, or per-account Facepunch acceptance. A tool reading only modified A2S replies may display a different value; that does not establish a change in Rust's public server list.

The review read all six default-branch files, relevant issues/comments, release metadata, the `port-remapping` comparison and its complete `main.go`. Fixed versions were master `ffd3edd24466dc4b40a5521fbc7cc666672947d2` and port-remapping `f0ba3cbea4e7ab015fbe5ea457bd1e6ad9bdd507` ([unmerged PR 8](https://github.com/anatolykopyl/server-query-fake-player-count/pull/8)). Release metadata described v1.0.0, published 2025-02-23; its binaries were not downloaded or assumed identical to master.

## Actual processing

An A2S client queries the Go proxy, which queries the real server, edits the reply and sends it back. The README originally targets DayZ and says other games might work. Its listener is a query port, not a player connection port; this is not an Oxide plugin or DLL.

| Source location | Behavior |
| --- | --- |
| `main.go:62` | Branches on the fifth request byte; modifies INFO/PLAYER or forwards one other reply |
| `main.go:123` | Locates INFO's one-byte players field, adds a configured amount, attempts a capacity clamp |
| `main.go:153` | Adds PLAYER records with empty names, index zero, score zero and fixed duration bytes |
| Entire reviewed implementation | No ticket issuance/validation, Rust lifecycle/state synchronization, EAC module or Facepunch count API |

It neither parses Rust `cp` nor updates the actual active-player list. Earlier reviewed GameDig paths use `cp`; the applicable ordinary Rust browser path also applies a Facepunch public-count limit. Different tools can therefore show different numbers. This round did not revalidate the currently running client's switches or browser branch.

## Concrete limitations

1. [Issue 6](https://github.com/anatolykopyl/server-query-fake-player-count/issues/6) reports an INFO challenge causing a slice-bounds crash. The author also reported that their experiment had not worked. INFO still lacks prior type/length validation; PLAYER has a challenge exception but incomplete bounds checking. This is source/issue evidence, not a live reproduction in this round.
2. [Issue 5](https://github.com/anatolykopyl/server-query-fake-player-count/issues/5) discusses mismatched advertised and proxy endpoints. A Project Zomboid user reported that selecting a server showed the edited number while the initial list retained the real number. Issue 4 has related browser visibility feedback. These are not Rust success reports.
3. The new branch changes eight files, mainly Docker, Compose, CI and deployment documentation. Its complete `main.go` differs by one help string; it does not add Rust cp/EAC/backend logic. The author said the branch was untested.
4. Each request creates a new upstream socket and reads once into 1024 bytes. There is no split-reply assembly, compression decoding, read timeout or concurrency limit. Large replies cannot be parsed as complete messages; silent upstreams may retain goroutines. Changing source ports can also interfere with port-bound challenges, depending on the server.
5. Byte conversion before addition can wrap counts, and INFO/PLAYER clamping differs. Random durations are generated but never written into the appended records; fixed bytes are used instead. Empty entries are not genuine accounts, game time or independently measured latency.

The project supplies a useful example of the distinction between query output and actual/publicly accepted players. Its name, screenshots from another game and wording such as “reported to Steam” do not prove authenticated Steam population or Facepunch adoption.

All 18 public HTTP reads succeeded; full URLs/hashes are in the JSON. Raw responses are private ignored research intermediates. This round did not compile/run/install the project, download release assets, modify ports/firewalls, log into remote systems, use server credentials, restart the service or change account connections.
