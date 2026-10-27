# NPC AI discussion and read-only design status

Historical scope: 2026-10-24. See the [original report](npc-ai-design-status-2026-10-24.md). This report distinguishes discussion and static interfaces from implemented behavior. Later player-action and chat reports supersede this historical feature inventory.

The operator requested account-driven movement/chat and NPC AI without launching Rust, and retained Steam accounts as the desired architecture. That control path was not implemented at this stage. Existing workers, API, UI and runtime were unchanged.

Read-only source review found no PlayerTick, chat or NPC behavior core at that time. Static metadata exposed separate server-NPC/navigation interfaces. No assemblies were executed, plugins loaded, NPCs spawned or movements tested.

A design sketch proposed patrol with observed arrival, monotonic waiting, following a named tester at a bounded distance, and stopping on navigation failure. Preset chat would require explicit NPC labels, directed recipients, deduplication and budgets. Proposed tests covered stale observations, clock reversal, invalid coordinates, blocking, duplicates and stop priority. **Neither the AI core nor those tests was implemented.**

Server NPCs and Steam-account players are different architectures. Static metadata establishes neither working control nor public-population effects. Private design/static scripts remain in ignored work/npc-ai-review, with hashes recorded in the final archive. No network capture, RCON, login/reconnection, server-setting change or deployment occurred. The operator ended that research phase, with no automatic continuation task left running.
