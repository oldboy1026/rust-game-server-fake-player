# DLL population investigation: hidden calls recovered, public counts unresolved

Historical status at 2026-10-25, 16:31 Beijing time. [Original](dll-count-investigation-2026-10-25.md); [structured results](dll-count-investigation-2026-10-25.json). **No verified public-count repair DLL was produced.** The supplied FakePlayers.dll was a research sample, not proof of the unnamed successful tool described by another person. It was not executed, installed, modified or allowed to contact its external service.

## Stable roster across a new public batch

At 16:13:37, 16:14:37 and16:15:37 all three sources succeeded. Eight local entered_game sessions matched eight identities in a real roster 17, with nine others; both identity groups stayed equal to the initial set. cp stayed 17, A2S players 23/bots 0, Facepunch 8. Public Last-Modified advanced08:09:42→08:14:39 UTC and then repeated. This crossed a real new batch, not only old cache, but intervals cannot exclude transient reconnects/eligibility changes, and aggregate 8 cannot be assigned to one group.

Probe active/connected/networkConnected/networkAuthenticated were17, rawTickRatePositive 9, EAC mappings0. Raw Tick count did not equal public 8; these aggregates do not reveal backend rules/EAC. The applicable browser branch givesmin(17, 8)=8; rewritingcp17 cannot set the other source. Existing eight connections were preserved with no inputs/configuration/DLL changes.

At 16:31:36–38, the same eight research connections plus six others gave roster/cp 14, A2S 20, bots 0, public 7(Last-Modified08:29:39). Probe tick-positive 6, EAC mappings0. This later changing roster is not a second stable experiment, and public 7 cannot be attributed to any identity or inferred to equal the other-player/Tick group.

## Static resource recovery

Original sample SHA-256:`5b939869639363ebc690c34beef57243b066a8e73ce2dc44bafd5178c56eeb19`. Trusted dnlib metadata and a bounded pure-data interpreter modeled arrays, integers, dictionaries and streams, stopping on unknown external calls. The sample was not loaded into CLR; business VM, Harmony and HTTP were not run.

Of the 41, 988-byte VM resource, 39, 983 bytes were recovered, hash `a055931664f3e5c525428b4ef417224965152496f1de5edc86831e071fbcc6bb`. Four complete original IL modular operations matched independent integer calculations before 164 equivalent operations decoded the rest; first 64 bytes matched the earlier no-shortcut read. All 23 containers (22 previously unknown business wrappers plus a four-byte helper), 205 instruction descriptions and 2373 instructions parsed with exact body exhaustion. An independent raw reader/operand model matched all 23 methods/2, 373 instructions. All 368 direct-member/type descriptions parsed; 128 previous string inputs remained valid, and 19 business call sites exposed 16 distinct inputs. These are static consistency results, not runtime/license/authentication/count success.

## Recovered call chains

- Initialization06000353 atVM812/840 registers060003B5 and calls HTTP wrapper06000370. Periodic06000355 snapshots a Dictionary<UInt64, string>, serializes identities/names, registers060003B6 and uses the same wrapper.06000370 queues the0600038E JSON POST path. No external request or authorization change occurred.
- Callback060003B5 populates runtime reflection-name fields/readiness from external JSON. The actual name table was not obtained and must not be invented.
-0600035C at665–769 resolves Network.Connection and calls 06000378. That factory looks up/invokes FormatterServices.GetUninitializedObject, which skips constructors; it is not proof of network/Steam/EAC admission. Later reflection writes and IList.Add depend partly on the unknown name table.
-0600035B reads UInt64/string from JSON, Base64-decodes bytes and reflectively invokes a runtime-named `(UInt64,Byte[])` Boolean instance method on a runtime-resolved service. A read-only scan of 266 assemblies, zero failures, found only IPlatformService.BeginPlayerSession and Rust.Platform.Steam.SteamPlatform.BeginPlayerSession matching; the latter calls SteamServer.BeginAuthSession. This is a compatible candidate, not proof of the actual runtime target, a valid ticket, async success or public adoption.
- Managed callback0600039B calls35B at IL197 and skips false at202; true registers06000384 at221 and schedules via06000348 at232.384 calls35C at IL19. This establishes a local validation-before-object-construction path; it does not prove periodicB6 enters it.

The sample therefore contains external-name/task data and server-side artificial object assembly, not a demonstrated repair of genuine network-player reporting. Unknown dynamic targets prevent claiming all hidden effects have been ruled out.

Earlier analysis found capacity06000350 only in visible admin-chat calls. Newly decoded35C also invokes it atVM530. The known non-generic IList incompatibility with ListHashSet<BasePlayer> in06000375 remains; this expands its affected scope, without proving the periodic main path depends on it or that a collection fix changes public counts.

Earlier genuine native reporting already observed Steam validation OK, BUpdateUserData true and active-list+1. Repeating that auth or constructing another object has no verified repair basis. A separate 266-assembly boundary scan found 72 matching methods, zero failures, but no reproducible missing-report defect. What remains missing is backend eligibility/account-level adoption evidence. A justified DLL repair needs a demonstrated normal-path failure/version mismatch, not aggregate arithmetic alone.

Private resources/interpreters/cross-checks remain under ignored work/dll-count-research-20261025. The public JSON omits identities, tickets, authorization and embedded service addresses. Evidence correction: a 16:46 driver reused paths and overwrote 16:31 final-private/public raw files. The full sanitized 16:31 snapshot survived in JSON and final-readonly-safe.json was reconstructed with its original SHA; the two raw originals were not recoverable and are explicitly marked unavailable. Later observations use unique directories rather than claiming those overwritten originals can still be rechecked.
