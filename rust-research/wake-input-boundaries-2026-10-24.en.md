# Boundaries for ordinary wake input

Historical static review: 2026-10-24. See the [original report](wake-input-boundaries-2026-10-24.md) and [hash/token evidence](wake-input-boundaries-2026-10-24.json). At this stage the evidence did not establish a complete wake sequence with safe release or any public-count effect. No Tick, account, server, configuration or test-suite operation occurred.

ProtoDelta copies the old baseline before applying fields. Omitted fields therefore retain old values. Empty Input, ModelState or Vector3 submessages do not reliably clear prior state. The ModelState constructor's flags value of four differs from the pool reset's zero, so an empty object has no fixed meaning of four. In the analyzed hash, the ProtoDelta token was 060000CD; excerpts for the older 060000D3 must not be mixed with it.

A valid input edge in the sleeping branch calls EndSleeping and returns early. An already-awake race or release frame can nevertheless reach ordinary position processing. RecordPacket may serialize the complete Tick before that branch and requires both InputMessage and ModelState. Input-only messages do not establish the full workflow.

The player.wakeup command is ServerAdmin=true and ServerUser=false. Outer authorization requires RCON/admin, and its body further requires admin/developer/cinematic permission plus a selected sleeping target. Cinematic status does not bypass outer authorization. It is not an ordinary self-wake command; no permission change or RCON substitute was attempted.

Real position, parent, pose and eye-state provenance remained incomplete. Earlier static evidence used localPosition and camera/PlayerEyes rather than an assumed zero eye vector. Finding the NETSND_Send import did not establish Tick-to-RakNet priority, reliability, channel or cadence; parameters from identity messages cannot simply be reused.

The next step was receive-only complete own-state observation with sequence/freshness checks, followed by full-overwrite and send-path verification. The later [wake implementation](player-tick-wake-2026-10-25.en.md) records subsequent progress without rewriting this earlier boundary.
