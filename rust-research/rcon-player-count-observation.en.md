# Read-only RCON population and reporting observation

English edition of the [original procedure](rcon-player-count-observation.md). This procedure separates active server population, event generation and uploader state. Commands were verified in the analyzed local registration table and method bodies; the original report did not claim remote execution or identical remote configuration.

After obtaining authorized RCON access, record the time and run these commands one at a time. Supply no arguments to the variable getters.

```text
global.serverinfo
analytics.stats
analytics.tablestats
analytics.uploaderstats
analytics.gameplay_analytics
analytics.gameplay_tick_analytics
analytics.performance_analytics
analytics.dryrun
server.eac_gameplay_data
```

Wait at least six minutes, record the time and repeat the first four commands. Repeat the five getters if configuration may have changed. This spans the local default five-minute event batch; it does not guarantee a public population update. Public-count comparisons should cover at least two newly published batches and corresponding client refreshes. A global batch update alone does not prove the target was recalculated.

| Output | Useful aggregate fields |
| --- | --- |
| `global.serverinfo` | Players, Joining, Queued, MaxPlayers and Protocol; Players comes from the active-player list |
| `analytics.stats` | Changes in SerializedCount, SerializedSize, UploadedSize and QueueCount |
| `analytics.tablestats` | Chosen uploader, upload interval and serialization changes for server-event tables |
| `analytics.uploaderstats` | Enabled and serialization counts for each uploader; these are not per-uploader successful-upload byte counts |
| Five getters | Actual gameplay, tick, performance, DryRun and EAC gameplay-data switches |

With `analytics.dryrun=true`, the analyzed Facepunch uploader skips HTTP while still increasing its uploaded-byte counter. Increasing Enabled/UploadedSize therefore does not prove network transmission. Disabled uploaders can have their queues and accumulated data cleared by the management loop; shrinking queues do not prove success either.

Disabling gameplay analytics stops periodic player aggregation. Performance events may use an hourly schedule even when enabled, so six quiet minutes do not demonstrate failure. Successful telemetry upload still does not establish that an account contributes to trusted population. `server.eac_gameplay_data` controls extra gameplay data and is not an EAC authentication result.

If a command is missing or denied, retain that response and verify version and permissions; plugins may intercept commands. This procedure collects aggregate results only. It does not call for raw `status`, bulk configuration enumeration, connection strings, player identities, value changes, flush/reset, restart or DLL installation.

Static registration evidence: `ConsoleGen..cctor 06000203`, `Admin.ServerInfo 06009E79`, `Analytics.Stats 06009228`, `TableStats 06009229`, `UploaderStats 0600922A`; the analyzed `Command.DefaultCall 0600003B` skips the setter when no argument is supplied. Hashes, filters and upload paths are in [reporting evidence](trusted-count-reporting-evidence-2026-10-24.json).
