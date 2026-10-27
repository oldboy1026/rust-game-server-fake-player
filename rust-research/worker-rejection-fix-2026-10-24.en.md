# Server rejection incorrectly displayed as incomplete shutdown

Historical repair: 2026-10-24. See the [original report](worker-rejection-fix-2026-10-24.md) and [evidence](worker-rejection-fix-2026-10-24.json). The worker exit defect was repaired; public population remained unresolved.

The target's read-only configuration returned server.maxconnectionsperip = 5. The analyzed path counts concurrent game connections from one IP, including unauthenticated connections, and rejects excess connections before identity exchange. This differs from management-channel limits. Spaced starts do not raise simultaneous capacity. No limit was changed in this experiment.

After DisconnectReason, the worker emitted server_rejected with a fixed category, then emitted the event again at loop exit without that category. Reading the second event raised KeyError. Cleanup/final output could finish, but the nonzero exit caused the parent to replace the genuine refusal with “incomplete shutdown”. Other abnormal exits need separate analysis.

The repair skips duplicate rejection and preserves fixed parent stages for connection-count/rate limits, Steam authentication, bans, full servers and unsupported protection. It neither treats abnormal exits as success nor adds automatic retry or bypass.

Five fake-native test groups exercised eleven real-main paths. The older version failed nine rejection paths; the repair passed final-state, cleanup and privacy checks. Four synthetic RustSession cases covered capacity, Steam authentication, full server and unknown refusal, with the ticket lease retained until process/pipe closure. All 35 Node tests passed.

Three live attempts between 09:29:26 and 09:29:52 UTC under the unchanged limit of five produced one admission and two explicit capacity rejections after approximately 0.3 seconds. Duplicate-event generic errors did not recur. Only the exact newly started sessions were stopped; their tickets became inactive and existing owner sessions remained untouched.

New Python workers loaded the repair without restarting existing workers. The older Node process had not yet loaded improved wording for same-IP count/rate limits; historical records were not rewritten. At this report's cutoff, a proposed later 39-account experiment still awaited confirmation of a temporary global 5 → 50 limit change and restoration. Neither that configuration change nor the bulk script ran in this round. Script syntax/static review was not an experiment result.
