"""Short lived standalone Rust identity probe; secrets enter only via stdin.

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
No tick, world loading, sustained player connection or EAC session is claimed.

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
from pathlib import Path
import struct
import sys
import time


sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("rust_native_peer", Path(__file__).with_name("native-peer.py"))
native = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(native)

MAX_INPUT_BYTES = 32768
MAX_RECEIVE_BYTES = 2 * 1024 * 1024
BUILD_PROTOCOL = 2635
BUILD_CHANGESET = 168909
BUILD_TIME_MS = 1792686656000
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
    "sentPackets": 0,
    "worldMessages": 0,
    "stages": [],
}


class InputError(ValueError):
    pass


def emit(stage, **metadata):
    # One final JSON is consumed by the service. No untrusted string from stdin
    # or the remote server is ever copied into this object.
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
    if mapped not in RESULT["stages"]:
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
    elif stage == "server_rejected":
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


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--seconds", default=45, type=float)
    parser.add_argument("--no-ready", action="store_true")
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
    if sys.platform != "win32" or struct.calcsize("P") != 8:
        raise ValueError()
    native.verify_dll(args.dll, args.sha256)
    api = native.load_api(args.dll)
    bind_sender(api)
    peer = None
    counts, lengths = Counter(), Counter()
    sent_auth = sent_ready = False
    stop_reason = "receive_deadline_reached"
    started = time.monotonic()
    emit("input_validated", eosIdentityAvailable=False, eacSessionAvailable=False)
    try:
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
        while time.monotonic() < deadline:
            if not api.NET_Receive(peer):
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
        emit(stop_reason)
    finally:
        closed = False
        if peer:
            api.NET_Close(peer)
            closed = True
            emit("native_wrapper_closed")
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
        identity = read_identity(sys.stdin.buffer)
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
        print(json.dumps(RESULT, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
