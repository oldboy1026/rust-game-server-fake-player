# Classification of outgoing normal-client RPCs

Historical offline analysis: 2026-10-25, using an earlier manual-play capture from 18:13:00–18:14:32 Beijing time. See the [original report](normal-client-rpc-actions-2026-10-25.md) and [ten evidence hashes](normal-client-rpc-actions-2026-10-25.json).

Thirty-one unique outbound RPCs grouped into eight function hashes: OnProjectileAttack (1), BroadcastSignalFromClient (13), OnPlayerLanded (1), OnProjectileUpdate (1), Pickup (1), CLProject (1), RequestAnimalStats (6) and PlayerAttack (7). These cover attack, landing, pickup, signals and queries. The independent program did not then implement those complete gameplay workflows.

Raw packets were filtered again by the actual RustClient socket and target, then deduplicated by reliable sequence. Only fixed function hashes were read; entity IDs and arguments were not extracted. Nothing was sent, replayed or executed. The total of 31 matched earlier analysis without altering captures or evidence.

An offline dnlib scan read 23, 895 unique method names and applied the verified ManifestHash. All eight hashes matched RPC_Server-marked names across twelve declarations, demonstrating hash reuse for identical names. The MVID matched current/prior target observations; the exact SHA is recorded in the JSON. No game assembly was executed.

Pickup could resolve to CollectibleEntity, RFTimedExplosive or WorldItem; CLProject to BaseMelee or BaseProjectile; RequestAnimalStats to ChickenCoop or LivestockAnimal. Actual recipient entities and successful effects were not inferred. A query also need not correspond to a manual keypress.

The result establishes observed requests from a normal client, not successful hits, pickups or public-count eligibility. It analyzes earlier manual play rather than activity in the later repetition. It added no automated attacks, repeating behavior, fabricated reporting or EAC implementation. Raw evidence remains private and ignored.
