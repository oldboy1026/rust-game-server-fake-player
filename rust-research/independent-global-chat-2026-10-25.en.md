# Independent public chat verification

Historical report: 2026-10-25, Beijing time. [Original](independent-global-chat-2026-10-25.md); [42 evidence hashes and results](independent-global-chat-2026-10-25.json).

One operator-selected account was normally admitted and sent one “1”; server history and the operator's game view confirmed it. Fifteen additional idle project accounts then entered at spaced intervals and each sent one “1”. All fifteen fresh Channel 0 entries matched full decimal Steam identity, message, channel, time and the pre-send history set, excluding other players/old records. Real identities and raw chat remain ignored locally.

The batch ran 19:31:06–19:32:25. Admission/send times for test01–15 were 19:31:10, 16, 21, 26, 30, 36, 41, 45, 51, 55; 19:32:02, 06, 11, 17, 22 (test10 sent at 19:31:56). At 19:34:26 all 15 remained in the roster and entered_game, with unchanged startedAt, chatMessagesSent = 1 and active/server-validated tickets. The first account also retained its original connection: 16 project players within a total roster 22.

Test15 later lost Steam and its game session ended. The same identity recovered at 19:39:16 without resending chat. At 19:41:28 all 15 were again present with active/validated tickets; each still had exactly one historical “1”. Fourteen retained their original session; recovered test15 had a new startedAt and new-session chatMessagesSent = 0. The first account remained unchanged. Steam online was 38, project game sessions 16, total server roster 21. This must not be described as an uninterrupted connection for every account.

## API semantics

`POST /v1/accounts/{id}/rust-chat {"text":"1"}` sends through the existing account's actual game connection after own-entity/own-FinishLoading gates and supported protection checks. It builds one fixed quoted `chat.say` argument, allowing at most 128 Unicode characters/512 UTF-8 bytes and rejecting controls, double quotes, backslashes and semicolons. Per-account spacing is at least five seconds with one in-flight request. Text is not retained in local status/log metadata.

The message uses 0x98, u32LE UTF-8 byte length and the fixed command. Server ConVar.Chat.say resolves the Player from the actual connection; no sender spoof or RCON broadcast substituted for player chat. HTTP 202/sent_to_transport reports native sending only and retains serverConfirmed=false. This report's reception claim instead comes from read-only chat.tail matching. Timeouts are not retried automatically; stop/exit completes pending requests while preserving ticket-cleanup order.

All 51 Node, 38 Python checks and frontend syntax checks passed, covering text boundaries, UTF-8, admission gates, rate limits, receipt matching, connection end, authorization and worker sending. Offline tests did not load game DLLs or open game traffic; the live 16-account record is separate evidence.

The route required one controlled reload while zero games were active. Steam temporarily fell to 9; staggered recovery of only the original online set reached 34/38, then 38/38 by 19:41:04 with unchanged autoConnect. Recovery did not stop active game sessions. The operator-requested sixteen sessions remained running. No server DLL/statistics change, valid EAC session or Facepunch repair was established. Successful chat does not reveal public-count eligibility. At this date Windows UI control was unavailable, so live operations used the independent program and webpage buttons had not received visual automation verification.
