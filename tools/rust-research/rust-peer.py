"""Standalone Rust identity worker; secrets enter only via stdin.

Input is one JSON line, at most 32768 bytes:
  steamId: decimal uint64 string (real logged-in account)
  username: the account's display name
  sessionTicketBase64: real Steam auth session ticket for app 252490
Optional: os, branch, language, ready={clientInfo:[{name,value}],globalNetworking}.
Default os/branch/language are windows/release/en. Build constants are the
observed protocol 2635, changeset 168909 and buildTime 1792686656000 ms.

It sends GiveUserInformation only after RequestUserInformation. EOS identity
and anticheat tokens are empty because this worker has no protected runtime.
An EAC message or protected encryption requirement stops the attempt.
Ready uses the verified empty protobuf by default, only after an unencrypted
Approval; --no-ready stops after Approval. Explicit clientInfo is optional.
It recognizes only its own entity and the exact own FinishLoading RPC as
evidence of PlayerInit/EnterGame. --persistent --stream keeps receiving until
a stop line, stdin EOF, remote disconnect or protected requirement. It sends
no PlayerTick by default and implements no EAC session. --wake-on-connect
optionally sends one bounded neutral/duck/release Tick cycle from a fresh,
supported own snapshot after FinishLoading, then observes the awake snapshot.
--respawn-on-dead optionally attempts one fixed own respawn command, only with
a fresh dead self snapshot and that entity's exact FinishLoading observation.
Post-send alive metadata records reception, not a server command acknowledgement.

Static managed sources are the hashes recorded in evidence.json, Steam depot
258551 manifest 93946663446561466. Relevant tokens: Peer.SendTo 06000059,
ToRaknetPriority 0600005D, ToRaknetPacketReliability 0600005E, SendInfo ctor
0600016F, Approval.Deserialize 0600053D, ClientReady.Serialize 06000BB9,
ClientInfo.Serialize 06002AE9, ServerMgr.ClientReady 06007A9D. The current
native DLL's NETSND_Send/WriteBytes/GUID ABI is also statically verified.
"""

import argparse
import base64
import binascii
from collections import Counter
import ctypes
import importlib.util
import ipaddress
import json
import math
from pathlib import Path
import struct
import sys
import threading
import time


sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("rust_native_peer", Path(__file__).with_name("native-peer.py"))
native = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(native)
_tick_spec = importlib.util.spec_from_file_location("rust_player_tick", Path(__file__).with_name("rust_player_tick.py"))
player_tick = importlib.util.module_from_spec(_tick_spec)
_tick_spec.loader.exec_module(player_tick)

MAX_INPUT_BYTES = 32768
MAX_RECEIVE_BYTES = 2 * 1024 * 1024
BUILD_PROTOCOL = 2635
BUILD_CHANGESET = 168909
BUILD_TIME_MS = 1792686656000
# StringEx.ManifestHash (Rust.Global.dll token0600019D): lowercase UTF-8,
# MD5, then BitConverter.ToUInt32(hash, 0), verified against real RPC frames.
FINISH_LOADING_RPC_ID = 2811987493
PROGRESS = None
RESULT = {
    "dllSha256": native.INSPECTED_SHA256,
    "abi": "windows-x64",
    "created": False,
    "closed": False,
    "transportConnected": False,
    "identitySent": False,
    "approved": False,
    "readySent": False,
    "playerConnected": False,
    "eacVerified": False,
    "selfEntityObserved": False,
    "finishLoadingObserved": False,
    "respawnOnDeadEnabled": False,
    "respawnAttempted": False,
    "respawnSent": False,
    "respawnAliveObserved": False,
    "ownPlayerState": {"observed": False, "snapshots": 0},
    "sentPackets": 0,
    "worldMessages": 0,
    "entityParseFailures": 0,
    "stages": [],
}


class InputError(ValueError):
    pass


def emit(stage, **metadata):
    # Only safe snapshots are consumed by the service. No untrusted string
    # from stdin or the remote server is ever copied into this object.
    mapped = {
        "transport_connection_accepted": "transport_connection_request_accepted",
        "identity_submitted": "identity_sent",
        "approval_received": "approved",
        "ready_submitted": "ready_sent",
        "entity_message_received_after_ready": "world_received",
        "protected_eac_session_required": "eac_required",
        "server_rejected": "disconnect_reason_received",
        "unsupported_receive_length": "invalid_receive_length",
    }.get(stage, stage)
    if stage == "summary":
        for key in ("closed", "receivedPackets", "firstByteCounts", "bitLengthCounts", "elapsedSeconds"):
            RESULT[key] = metadata[key]
        return
    changed = mapped not in RESULT["stages"]
    if changed:
        RESULT["stages"].append(mapped)
    if stage == "native_wrapper_created":
        RESULT["created"] = True
    elif stage == "native_wrapper_closed":
        RESULT["closed"] = True
    elif stage == "transport_connection_accepted":
        RESULT["transportConnected"] = True
    elif stage == "identity_submitted":
        RESULT["identitySent"] = True
        RESULT["sentPackets"] += 1
    elif stage == "ready_submitted":
        RESULT["readySent"] = True
        RESULT["sentPackets"] += 1
    elif stage == "approval_received":
        RESULT["approved"] = True
        RESULT["encryptionLevel"] = metadata["encryptionLevel"]
    elif stage in {"entity_message_received_after_ready", "world_received"}:
        RESULT["worldMessages"] += 1
    elif stage == "self_entity_observed":
        RESULT["selfEntityObserved"] = True
    elif stage == "finish_loading_observed":
        RESULT["finishLoadingObserved"] = True
        # Self snapshot followed by its exact no-argument FinishLoading RPC
        # confirms the observed server reached PlayerInit and EnterGame.
        RESULT["playerConnected"] = RESULT["selfEntityObserved"]
    elif stage == "server_rejected":
        if metadata["category"] == "connection_rate_limited":
            # The parent already understands this stage. Do not set its
            # generic "other" rejection, which would mask the limit message.
            if "transport_connection_rate_limited" not in RESULT["stages"]:
                RESULT["stages"].append("transport_connection_rate_limited")
        else:
            RESULT["disconnectCategory"] = {
                "eac_or_eos_requirement": "eac_required",
                "steam_authentication_rejected": "steam_auth",
                "account_or_server_ban": "banned",
                "protocol_or_build_mismatch": "protocol_mismatch",
                "server_full": "server_full",
                "unspecified_server_rejection": "unknown",
            }.get(metadata["category"], "other")
            if RESULT["disconnectCategory"] == "eac_required" and "eac_required" not in RESULT["stages"]:
                RESULT["stages"].append("eac_required")
    if changed and PROGRESS is not None:
        PROGRESS()


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--seconds", default=45, type=float)
    parser.add_argument("--no-ready", action="store_true")
    parser.add_argument("--persistent", action="store_true", help="Continue until a stop control line, stdin EOF, remote disconnect or protected requirement")
    parser.add_argument("--stream", action="store_true", help="Emit full safe JSONL snapshots every five seconds and at new stages")
    parser.add_argument("--respawn-on-dead", action="store_true", help="Attempt one own respawn after exact own FinishLoading and a dead self snapshot no older than ten seconds")
    parser.add_argument("--wake-on-connect", action="store_true", help="Attempt one bounded ordinary own wake Tick cycle after FinishLoading; no continuous movement or EAC")
    parser.add_argument("--validate-input", action="store_true", help="Validate stdin/serialization without loading any DLL or opening a socket")
    args = parser.parse_args()
    try:
        args.host = str(ipaddress.IPv4Address(args.host))
    except ipaddress.AddressValueError:
        parser.error("--host must be a literal IPv4 address")
    if not args.dll.is_absolute() or args.sha256.lower() != native.INSPECTED_SHA256:
        parser.error("An absolute DLL path and the inspected SHA-256 are required")
    if not 1 <= args.port <= 65535 or not 5 <= args.seconds <= 120:
        parser.error("Use a UDP port 1..65535 and a receive deadline from five to 120 seconds")
    if args.persistent and not args.stream:
        parser.error("--persistent requires --stream")
    return args


def bounded_text(value, max_chars, max_bytes):
    if not isinstance(value, str) or len(value) > max_chars or "\0" in value:
        raise InputError()
    encoded = value.encode("utf-8", errors="strict")
    if len(encoded) > max_bytes:
        raise InputError()
    return encoded


def read_identity(stream):
    line = stream.readline(MAX_INPUT_BYTES + 1)
    if not line or len(line) > MAX_INPUT_BYTES:
        raise InputError()
    try:
        info = json.loads(line)
        if not isinstance(info, dict) or set(info) - {"steamId", "username", "sessionTicketBase64", "os", "branch", "language", "ready"}:
            raise InputError()
        steam_id = info["steamId"]
        if not isinstance(steam_id, str) or not steam_id.isascii() or not steam_id.isdecimal() or len(steam_id) > 20:
            raise InputError()
        steam_id = int(steam_id)
        if not 0 < steam_id < 2**64:
            raise InputError()
        ticket_text = info.pop("sessionTicketBase64")
        if not isinstance(ticket_text, str) or not 1 <= len(ticket_text) <= 1024:
            raise InputError()
        ticket = bytearray(base64.b64decode(ticket_text, validate=True))
        if not 1 <= len(ticket) <= 512:
            raise InputError()
        return {
            "steamId": steam_id,
            "username": bounded_text(info["username"], 256, 1024),
            "ticket": ticket,
            "os": bounded_text(info.get("os", "windows"), 128, 512),
            "branch": bounded_text(info.get("branch", "release"), 128, 512),
            "language": bounded_text(info.get("language", "en"), 256, 1024),
            "ready": info.get("ready"),
        }
    except (KeyError, TypeError, ValueError, UnicodeError, binascii.Error):
        raise InputError() from None


def append_sized(payload, data):
    payload.extend(struct.pack("<I", len(data)))
    payload.extend(data)


def encode_identity(identity):
    payload = bytearray([0x9E, 0xE4])
    payload.extend(struct.pack("<QI", identity["steamId"], BUILD_PROTOCOL))
    for name in ("os", "username", "branch", "ticket"):
        append_sized(payload, identity[name])
    append_sized(payload, b"")  # No EOS ProductUserId available.
    append_sized(payload, b"")  # No EOS/EAC identity token available.
    payload.extend(struct.pack("<iq", BUILD_CHANGESET, BUILD_TIME_MS))
    append_sized(payload, identity["language"])
    return payload


def varint(value):
    encoded = bytearray()
    while value >= 128:
        encoded.append((value & 127) | 128)
        value >>= 7
    encoded.append(value)
    return encoded


def encode_ready(ready):
    if not isinstance(ready, dict) or set(ready) - {"clientInfo", "globalNetworking"}:
        raise InputError()
    entries = ready.get("clientInfo")
    # Deserialize allocates an empty list before parsing even when no field1
    # exists. An empty protobuf is therefore valid for the server's foreach.
    if not isinstance(entries, list) or not 0 <= len(entries) <= 512:
        raise InputError()
    payload = bytearray([0x90])
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"name", "value"}:
            raise InputError()
        name = bounded_text(entry["name"], 256, 1024)
        value = bounded_text(entry["value"], 2048, 8192)
        item = bytearray([0x0A]) + varint(len(name)) + name
        item += bytearray([0x12]) + varint(len(value)) + value
        payload += bytearray([0x0A]) + varint(len(item)) + item
        if len(payload) > 65536:
            raise InputError()
    networking = ready.get("globalNetworking", False)
    if not isinstance(networking, bool):
        raise InputError()
    if networking:
        payload.extend([0x10, 1])
    return payload


def read_varint(data, offset):
    value = 0
    for shift in range(0, 70, 7):
        if offset >= len(data):
            raise ValueError()
        byte = data[offset]
        offset += 1
        if shift == 63 and byte > 1:
            raise ValueError()
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
    raise ValueError()


def approval_encryption(data):
    # Approval's encryption is optional uint32 field 12, default zero. Other
    # fields (world URLs, hostname etc.) are skipped without decoding/output.
    offset, encryption, found = 1, 0, False
    previous_field = 0
    while offset < len(data):
        key, offset = read_varint(data, offset)
        number, wire = key >> 3, key & 7
        if number == 0 or number < previous_field:
            raise ValueError()
        previous_field = number
        if wire == 0:
            value, offset = read_varint(data, offset)
            if number == 12:
                if found or value > 2**32 - 1:
                    raise ValueError()
                encryption, found = value, True
        elif wire == 1:
            offset += 8
        elif wire == 2:
            size, offset = read_varint(data, offset)
            offset += size
        elif wire == 5:
            offset += 4
        else:
            raise ValueError()
        if offset > len(data) or (number == 12 and wire != 0):
            raise ValueError()
    return encryption


def proto_fields(data):
    """Bounded protobuf scanner; strings are never decoded or retained."""
    offset = previous = operations = 0
    while offset < len(data):
        operations += 1
        if operations > 4096:
            raise ValueError()
        key, offset = read_varint(data, offset)
        field, wire = key >> 3, key & 7
        if not 1 <= field <= 2**29 - 1 or field < previous:
            raise ValueError()
        previous = field
        if wire == 0:
            value, offset = read_varint(data, offset)
        elif wire == 1:
            value = None
            offset += 8
        elif wire == 2:
            size, offset = read_varint(data, offset)
            if size > len(data) - offset:
                raise ValueError()
            value = memoryview(data)[offset:offset + size]
            offset += size
        elif wire == 5:
            value = memoryview(data)[offset:offset + 4]
            offset += 4
        else:
            raise ValueError()
        if offset > len(data):
            raise ValueError()
        yield field, wire, value


def self_entity_snapshot(packet, steam_id):
    # SendAsSnapshot06005188: 0x91 + uint32 sequence + raw Entity protobuf.
    # ToStream0600518F writes lengthDelimited=false; no compression/delta.
    # Entity fields: 1 BaseNetworkable, 3 BasePlayer. The nested fields are
    # BaseNetworkable.uid=1:uint64, BasePlayer.userid=2:uint64 and
    # BasePlayer.playerFlags=7:int32; Entity.baseCombat=24, whose state is
    # field1:int32 and health field2:fixed32. Return no state until this complete
    # snapshot has both a valid entity ID and the logged-in account's user ID.
    if len(packet) < 6 or packet[0] != 0x91:
        return None
    selected = {}
    for field, wire, value in proto_fields(memoryview(packet)[5:]):
        if field in {1, 3, 24}:
            if wire != 2 or field in selected:
                raise ValueError()
            selected[field] = value
    if 1 not in selected or 3 not in selected:
        return None
    user = uid = flags = None
    for field, wire, value in proto_fields(selected[3]):
        if field == 2:
            if wire != 0 or user is not None:
                raise ValueError()
            user = value
        elif field == 7:
            if wire != 0 or flags is not None:
                raise ValueError()
            # int32 uses either a positive varint or sign-extended uint64.
            if 2**31 - 1 < value < 2**64 - 2**31:
                raise ValueError()
            flags = value
    if user != steam_id:
        return None
    for field, wire, value in proto_fields(selected[1]):
        if field == 1:
            if wire != 0 or uid is not None:
                raise ValueError()
            uid = value
    if not uid:
        return None
    # BasePlayer.Serialize060007F9 omits zero playerFlags. Its .ctor060007FC
    # leaves this int32 at zero; ResetToPool060007E5 explicitly clears it.
    # This is a full Entity snapshot, so an absent field means zero here.
    life_state, health_positive, combat_state_present = "unknown", None, False
    if 24 in selected:
        state, health_seen = 0, False
        for field, wire, value in proto_fields(selected[24]):
            if field == 1:
                if wire != 0 or combat_state_present:
                    raise ValueError()
                if 2**31 - 1 < value < 2**64 - 2**31:
                    raise ValueError()
                state, combat_state_present = value, True
            elif field == 2:
                if wire != 5 or health_seen:
                    raise ValueError()
                health = struct.unpack("<f", value)[0]
                if not math.isfinite(health):
                    raise ValueError()
                health_positive, health_seen = health > 0, True
        # Full BaseCombat snapshots initialize state to zero (Alive). The
        # component must exist before applying that default. An absent health
        # field remains unobserved here; no numeric health is exported.
        life_state = {0: "alive", 1: "dead"}.get(state, "unknown")
    return {
        "uid": uid,
        "flags": 0 if flags is None else flags,
        "flagsFieldPresent": flags is not None,
        "combatComponentObserved": 24 in selected,
        "combatStateFieldPresent": combat_state_present,
        "lifeState": life_state,
        "healthPositive": health_positive,
    }


def is_finish_loading(packet, entity_id):
    # ClientRPCStart06001534 writes exactly header + EntityID:uint64LE +
    # function:uint32LE. EnterGame's FinishLoading has no RPC arguments.
    return (entity_id is not None and len(packet) == 13 and packet[0] == 0x95
            and struct.unpack_from("<Q", packet, 1)[0] == entity_id
            and struct.unpack_from("<I", packet, 9)[0] == FINISH_LOADING_RPC_ID)


def control_reader(stream, stop, state):
    # Only a stop request is accepted; no payload forwarding or arbitrary RPCs.
    try:
        line = stream.readline(2049)
        if not line:
            state["reason"] = "control_eof"
        else:
            command = json.loads(line) if len(line) <= 2048 else None
            state["reason"] = ("stop_requested" if isinstance(command, dict)
                               and set(command) == {"stop"}
                               and command["stop"] is True
                               else "invalid_control_command")
    except (OSError, ValueError, UnicodeError):
        state["reason"] = "invalid_control_command"
    finally:
        stop.set()


def rejection_category(data):
    # NetWrite.String/NetRead.String use uint32LE UTF-8 lengths. Only a fixed
    # category leaves this function. Unrecognised or malformed strings stay
    # unspecified; no substrings, hashes or original bytes are emitted.
    if len(data) < 5:
        return "unspecified_server_rejection"
    size = struct.unpack_from("<I", data, 1)[0]
    if size > 8192 or size + 5 != len(data):
        return "unspecified_server_rejection"
    try:
        reason = data[5:].decode("utf-8", errors="strict").casefold()
    except UnicodeError:
        return "unspecified_server_rejection"
    rules = [
        (("eac", "easyanticheat", "easy anti", "anticheat", "anti-cheat", "eos"), "eac_or_eos_requirement"),
        (("steam auth", "auth ticket", "authentication ticket", "invalid ticket", "steam token"), "steam_authentication_rejected"),
        (("banned", "ban evasion"), "account_or_server_ban"),
        (("wrong connection protocol", "incompatible", "protocol", "wrong version"), "protocol_or_build_mismatch"),
        (("server is full", "server full"), "server_full"),
        (("password",), "server_password_required"),
        (("too many", "rate limit", "recently connected"), "connection_rate_limited"),
        (("timed out", "timeout"), "server_timeout"),
    ]
    for terms, category in rules:
        if any(term in reason for term in terms):
            return category
    return "unspecified_server_rejection"


def bind_sender(api):
    signatures = {
        "NETRCV_GUID": (ctypes.c_uint64, [ctypes.c_void_p]),
        "NETSND_Start": (None, [ctypes.c_void_p]),
        "NETSND_WriteBytes": (None, [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_int32]),
        "NETSND_Send": (ctypes.c_uint32, [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_int32, ctypes.c_int32, ctypes.c_int32]),
    }
    for name, (result_type, argument_types) in signatures.items():
        function = getattr(api, name)
        function.restype, function.argtypes = result_type, argument_types


def send(api, peer, guid, payload):
    buffer = (ctypes.c_ubyte * len(payload)).from_buffer(payload)
    api.NETSND_Start(peer)
    api.NETSND_WriteBytes(peer, buffer, len(payload))
    # SendInfo default Priority.Normal=1 maps to native MEDIUM_PRIORITY=2;
    # Reliable=0 maps to RELIABLE_ORDERED=3; default ordering channel is 0.
    return api.NETSND_Send(peer, guid, 2, 3, 0) != 0


def run(args, identity, auth, ready):
    global PROGRESS
    if sys.platform != "win32" or struct.calcsize("P") != 8:
        raise ValueError()
    native.verify_dll(args.dll, args.sha256)
    api = native.load_api(args.dll)
    bind_sender(api)
    peer = None
    counts, lengths = Counter(), Counter()
    sent_auth = sent_ready = False
    server_guid = None
    self_id = None
    last_self_snapshot = None
    finish_loading_self_id = None
    respawn_self_id = None
    respawn_sent_at = None
    wake = player_tick.WakeController(getattr(args, "wake_on_connect", False), proto_fields)
    RESULT.update(wake.metadata)
    RESULT["respawnOnDeadEnabled"] = args.respawn_on_dead
    stop_reason = "receive_deadline_reached"
    started = time.monotonic()
    last_snapshot = started
    stop = threading.Event()
    control_state = {"reason": "stop_requested"}

    def tick_progress():
        RESULT.update(wake.metadata)
        for stage in wake.take_events():
            emit(stage)

    def maybe_tick():
        if not sent_auth or not sent_ready or server_guid is None or stop.is_set():
            return None
        if RESULT.get("encryptionLevel") != 0:
            return None
        previous = wake.metadata["tickPacketsSent"]
        reason = wake.step(time.monotonic(), lambda payload: send(api, peer, server_guid, payload))
        RESULT["sentPackets"] += wake.metadata["tickPacketsSent"] - previous
        tick_progress()
        return reason

    def update_own_snapshot_age():
        if last_self_snapshot is not None:
            RESULT["ownPlayerState"]["ageSeconds"] = round(max(0, time.monotonic() - last_self_snapshot), 3)

    def maybe_respawn():
        nonlocal respawn_self_id, respawn_sent_at
        now = time.monotonic()
        if (not args.respawn_on_dead or RESULT["respawnAttempted"] or stop.is_set()
                or not sent_auth or not sent_ready or server_guid is None or RESULT.get("encryptionLevel") != 0
                or self_id is None or finish_loading_self_id != self_id
                or last_self_snapshot is None or not 0 <= now - last_self_snapshot <= 10
                or RESULT["ownPlayerState"].get("lifeState") != "dead"):
            return
        # Set before the native call: even a failed call is the only attempt
        # for this connection. This is a fixed ServerUser command bound by
        # ConsoleNetwork to the authenticated connection's own player.
        RESULT["respawnAttempted"] = True
        payload = bytearray(b"\x98\x07\x00\x00\x00respawn")
        if send(api, peer, server_guid, payload):
            respawn_self_id, respawn_sent_at = self_id, now
            RESULT["respawnSent"] = True
            RESULT["sentPackets"] += 1
            emit("respawn_sent")
        else:
            emit("respawn_native_send_failed")

    def snapshot():
        nonlocal last_snapshot
        update_own_snapshot_age()
        RESULT["receivedPackets"] = sum(counts.values())
        RESULT["firstByteCounts"] = {f"0x{k:02x}": v for k, v in sorted(counts.items())}
        RESULT["bitLengthCounts"] = {str(k): v for k, v in sorted(lengths.items())}
        RESULT["elapsedSeconds"] = round(time.monotonic() - started, 3)
        print(json.dumps({"type": "progress", **RESULT}, separators=(",", ":")), flush=True)
        last_snapshot = time.monotonic()

    if args.stream:
        PROGRESS = snapshot
    if args.persistent:
        # Use unbuffered FileIO for both identity and control. A remote close
        # may leave this daemon blocked in an OS read; unlike BufferedReader,
        # FileIO holds no buffered stdin lock during interpreter finalization.
        # Reading identity through the same raw stream avoids prefetching a
        # subsequent control line into a different buffer.
        threading.Thread(target=control_reader, args=(sys.stdin.buffer.raw, stop, control_state), daemon=True).start()
    try:
        emit("input_validated", eosIdentityAvailable=False, eacSessionAvailable=False)
        peer = api.NET_Create()
        if not peer:
            emit("native_create_failed")
            return
        emit("native_wrapper_created")
        startup = api.NET_StartClient(peer, args.host.encode("ascii"), args.port, 12, 500, 0)
        RESULT["startClientResult"] = startup
        if startup:
            emit("native_start_failed" if startup == 1 else "native_connect_start_failed")
            return
        emit("transport_connect_started")
        deadline = started + args.seconds
        while args.persistent or time.monotonic() < deadline:
            if stop.is_set():
                stop_reason = control_state["reason"]
                break
            if args.stream and time.monotonic() - last_snapshot >= 5:
                snapshot()
            if not api.NET_Receive(peer):
                tick_error = maybe_tick()
                if tick_error:
                    stop_reason = tick_error
                    break
                time.sleep(0.005)
                continue
            bits = api.NETRCV_LengthBits(peer)
            if bits < 8 or bits % 8 or bits > MAX_RECEIVE_BYTES * 8:
                stop_reason = "unsupported_receive_length"
                break
            pointer = api.NETRCV_RawData(peer)
            if not pointer:
                stop_reason = "null_receive_data"
                break
            first = ctypes.c_ubyte.from_address(pointer).value
            counts[first] += 1
            if bits in lengths or len(lengths) < 512:
                lengths[bits] += 1
            if first == 16:
                emit("transport_connection_accepted")
            elif first in {17, 18, 19, 20, 21, 22, 23, 24, 25, 26}:
                stop_reason = native.TRANSPORT_NOTIFICATIONS.get(first, "transport_connection_rate_limited")
                break
            elif first == 0x9D:
                emit("identity_requested")
                if sent_auth:
                    stop_reason = "repeated_identity_request"
                    break
                guid = api.NETRCV_GUID(peer)
                if not guid or guid == 2**64 - 1:
                    stop_reason = "invalid_server_guid"
                    break
                if not send(api, peer, guid, auth):
                    stop_reason = "identity_native_send_failed"
                    break
                sent_auth = True
                server_guid = guid
                emit("identity_submitted", bytes=len(auth), eosIdentityIncluded=False, eacTokenIncluded=False)
            elif first == 0xA2:
                stop_reason = "protected_eac_session_required"
                break
            elif first == 0x9A:
                packet = ctypes.string_at(pointer, bits // 8)
                emit("server_rejected", category=rejection_category(packet))
                stop_reason = "server_rejected"
                break
            elif first == 0x8F:
                if not sent_auth or sent_ready:
                    stop_reason = "unexpected_approval"
                    break
                packet = ctypes.string_at(pointer, bits // 8)
                try:
                    encryption = approval_encryption(packet)
                except ValueError:
                    stop_reason = "approval_schema_invalid"
                    break
                emit("approval_received", encryptionLevel=encryption)
                if encryption:
                    stop_reason = "protected_or_unsupported_encryption_required"
                    break
                if args.no_ready or ready is None:
                    stop_reason = "approval_received_ready_not_requested"
                    break
                guid = api.NETRCV_GUID(peer)
                if not send(api, peer, guid, ready):
                    stop_reason = "ready_native_send_failed"
                    break
                sent_ready = True
                emit("ready_submitted", bytes=len(ready))
            elif first == 0xA6:
                emit("server_queue_update_received")
            elif first == 0xA4:
                emit("world_received")
            elif first == 0x91 and sent_ready:
                emit("entity_message_received_after_ready")
                packet = ctypes.string_at(pointer, bits // 8)
                try:
                    observed = self_entity_snapshot(packet, identity["steamId"])
                except ValueError:
                    # Unsupported entity variants are ignored; a failed
                    # parse must never become a successful identity match.
                    observed = None
                    RESULT["entityParseFailures"] += 1
                    if wake.enabled:
                        wake.invalidate()
                if observed is not None and not wake.observe(packet, observed, time.monotonic()):
                    observed = None
                if observed is not None:
                    previous_state = RESULT["ownPlayerState"]
                    entity_changes = previous_state.get("entityChanges", 0)
                    if self_id is not None and self_id != observed["uid"]:
                        entity_changes += 1
                        # A historical FinishLoading for another entity must
                        # never authorize a command for this replacement.
                        finish_loading_self_id = None
                    self_id, flags = observed["uid"], observed["flags"]
                    last_self_snapshot = time.monotonic()
                    current_state = {
                        "observed": True,
                        # BasePlayer.PlayerFlags: Sleeping=16,
                        # ReceivingSnapshot=8 (Assembly-CSharp.dll).
                        "sleeping": bool(flags & 16),
                        "receivingSnapshot": bool(flags & 8),
                        "spectating": bool(flags & 32),
                        "wounded": bool(flags & 64),
                        "connectedFlag": bool(flags & 256),
                        "loadingAfterTransfer": bool(flags & 33554432),
                        "flagsFieldPresent": observed["flagsFieldPresent"],
                        "combatComponentObserved": observed["combatComponentObserved"],
                        "combatStateFieldPresent": observed["combatStateFieldPresent"],
                        "lifeState": observed["lifeState"],
                        "healthPositive": observed["healthPositive"],
                        "entityChanges": entity_changes,
                        "snapshots": RESULT["ownPlayerState"]["snapshots"] + 1,
                        "ageSeconds": 0,
                    }
                    changed = previous_state.get("observed") is True and any(
                        previous_state.get(key) != current_state[key]
                        for key in ("sleeping", "receivingSnapshot", "lifeState",
                                    "spectating", "wounded", "connectedFlag"))
                    current_state["stateChanges"] = previous_state.get("stateChanges", 0) + int(changed)
                    RESULT["ownPlayerState"] = current_state
                    alive_observed = (RESULT["respawnSent"] and not RESULT["respawnAliveObserved"]
                                      and self_id == respawn_self_id and observed["lifeState"] == "alive")
                    if alive_observed:
                        # Entity sequence ordering is not verified. This only
                        # records a full own alive snapshot received after
                        # the send, not causation or a server acknowledgement.
                        RESULT["respawnAliveObserved"] = True
                        RESULT["respawnAliveAfterSeconds"] = round(max(0, last_self_snapshot - respawn_sent_at), 3)
                    emit("self_entity_observed")
                    if alive_observed:
                        emit("respawn_alive_observed")
                    maybe_respawn()
            elif first == 0x95 and sent_ready and self_id is not None:
                packet = ctypes.string_at(pointer, bits // 8)
                if is_finish_loading(packet, self_id):
                    finish_loading_self_id = self_id
                    wake.finish_loading(self_id)
                    emit("finish_loading_observed")
                    # The full snapshot can arrive before FinishLoading.
                    # It still must be fresh when this gate is evaluated.
                    maybe_respawn()
                elif len(packet) >= 9 and struct.unpack_from("<Q", packet, 1)[0] == self_id:
                    # Unknown own RPCs may move/parent/transfer the player.
                    # Wait for a new full own state, or close if release is unsafe.
                    wake.invalidate()
            elif first in {0x92, 0x96, 0xA3} and sent_ready and self_id is not None:
                # Destroy/position/base-entity flags begin with the target EntityID.
                # Full position/correction simulation is outside this feature.
                packet = ctypes.string_at(pointer, min(bits // 8, 9))
                if len(packet) >= 9 and struct.unpack_from("<Q", packet, 1)[0] == self_id:
                    wake.invalidate()
            tick_error = maybe_tick()
            if tick_error:
                stop_reason = tick_error
                break
        # The rejection branch already emitted its fixed category. Re-emitting
        # it without metadata would raise KeyError before normal process exit.
        if stop_reason != "server_rejected":
            emit(stop_reason)
    finally:
        # Disable streaming before cleanup: a closed stdout must still allow
        # NET_Close and the final secret wiping in main to run.
        PROGRESS = None
        stop.set()
        # Closing the owned transport also clears a pressed input when a stop,
        # remote rejection or protection requirement prevents a safe release.
        wake.shutdown()
        tick_progress()
        closed = False
        if peer:
            api.NET_Close(peer)
            closed = True
            emit("native_wrapper_closed")
        update_own_snapshot_age()
        emit("summary", authSubmitted=sent_auth, readySubmitted=sent_ready,
             closed=closed, receivedPackets=sum(counts.values()),
             firstByteCounts={f"0x{k:02x}": v for k, v in sorted(counts.items())},
             bitLengthCounts={str(k): v for k, v in sorted(lengths.items())},
             elapsedSeconds=round(time.monotonic() - started, 3))


def wipe(buffer):
    if isinstance(buffer, bytearray):
        buffer[:] = b"\0" * len(buffer)


def main():
    args = parse_args()
    identity = auth = ready = None
    try:
        identity = read_identity(sys.stdin.buffer.raw)
        auth = encode_identity(identity)
        ready = encode_ready(identity["ready"] if identity["ready"] is not None else {"clientInfo": []})
        if args.validate_input:
            emit("serialization_validated", identityBytes=len(auth), readyBytes=len(ready) if ready is not None else 0)
            RESULT["identityBytes"] = len(auth)
            RESULT["readyBytes"] = len(ready)
            return 0
        run(args, identity, auth, ready)
        return 0
    except InputError:
        emit("input_rejected")
        return 2
    except (OSError, ValueError, AttributeError):
        # Suppress exception messages/tracebacks so stdin secrets cannot leak.
        emit("local_setup_or_native_call_failed")
        return 1
    except KeyboardInterrupt:
        emit("interrupted")
        return 130
    finally:
        wipe(auth)
        wipe(ready)
        if identity:
            wipe(identity["ticket"])
        output = {"type": "final", **RESULT} if args.stream else RESULT
        try:
            print(json.dumps(output, separators=(",", ":")), flush=True)
        except OSError:
            # The parent may already have closed its output pipe. Cleanup is
            # complete and no exception text or stdin content is emitted.
            pass


if __name__ == "__main__":
    raise SystemExit(main())
