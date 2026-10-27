# One live snapshot of the local server's actual security state

Historical observation: 2026-10-24, 15:50:18 Beijing time. [Original](count-snapshot-local-2026-10-24.md);[build/hash/snapshot evidence](count-snapshot-local-2026-10-24.json).

The self-written CountSnapshot loaded via the official Harmony command without installing a patch. It read one aggregate, unloaded at 15:50:19, and the copied DLL was removed by verified hash. Real-reference compilation had no errors/warnings; an independent review checked read/unload boundaries. No restart, player disconnect or configuration change occurred.

Steam interface/logged-on were true/true; Net.sv.secure=false, encryption 1, EAC interface=false, nonzero client handles 0, while IsAuthenticated returned true for one connection. Active/alive/awake/connected were1andReceivingSnapshot 0. Thus **the cached authenticated flag on this local server did not prove protected EAC**; static nonsecure paths can set it. This server can test normal transport, Steam backend state and diagnostics, not whether genuine EAC determines public counts. Nor does the result establish remote EAC filtering.

An earlier independent connection stopped at transport encryption; that is not evidence of EAC rejection or secure mode. RCON at 15:47:15/15:50:42 both had one player/no queue or joining, identical identity sets, and a connection duration spanning the diagnostic. One normal RustClient and RustDedicated remained running; project game connections 0. Set equality does not prove no transient changes or per-account EAC.

The unload final file reuses the cached snapshot with unload metadata; it is not a second state sample. This local server had no public-map entry, so no public-count effect was verified. See [CountSnapshot instructions](../tools/rust-research/CountSnapshot.en.md).
