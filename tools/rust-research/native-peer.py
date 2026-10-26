"""Bounded metadata-only probe for the inspected x64 Rust RakNet library.

Default mode only creates and closes the wrapper; it does not start a socket.
Supply an explicit IPv4 host and UDP port to initiate a transport connection.
This never submits a Rust identity, a Steam ticket, or an anticheat message.

ABI evidence: native-transport-evidence.json managed declarations, together
with static inspection of client SHA-256 5bd99d127e7453bf04793681bf8e6e25d
b8abebe16f9f15583da34807ed1aa44. NET_StartClient RVA 0x1e60 forwards its four
ints as remotePort, sendConnectionAttemptCount, intervalMS, timeoutTime to
RakPeerInterface::Connect (vtable +0x60). Connect signature reference:
https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/RakPeerInterface.h#L139

NET_Receive RVA 0x1d10 frees the previous packet before receiving another.
NETRCV_RawData returns borrowed data; inspect only before next receive/close.
The probe reads exactly its first byte and records the bit length. It never
prints packet contents, GUIDs, network addresses, startup strings, or tickets.
"""

import argparse
from collections import Counter
import ctypes
import hashlib
import ipaddress
import json
from pathlib import Path
import struct
import sys
import time


INSPECTED_SHA256 = "5bd99d127e7453bf04793681bf8e6e25db8abebe16f9f15583da34807ed1aa44"
SUPPORTED_DLL_HASHES = frozenset({
    INSPECTED_SHA256,
    # Dedicated build: ABI inspection and bounded native/transport tests recorded
    # in runtime-repair-2026-10-26.md. This is transport support, not EAC support.
    "a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21",
})

# These transport notification numbers come from the fixed upstream
# MessageIdentifiers.h. They describe RakNet transport, not Rust admission.
TRANSPORT_NOTIFICATIONS = {
    16: "transport_connection_request_accepted",
    17: "transport_connection_attempt_failed",
    18: "transport_already_connected",
    19: "transport_new_incoming_connection",
    20: "transport_no_free_incoming_connections",
    21: "transport_disconnection_notification",
    22: "transport_connection_lost",
    23: "transport_connection_banned",
    24: "transport_invalid_password",
    25: "transport_incompatible_protocol_version",
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", required=True, type=Path, help="Absolute inspected RakNet.dll path")
    parser.add_argument("--sha256", required=True, help="Expected full SHA-256, checked before loading")
    parser.add_argument("--host", help="Explicit target IPv4; omission selects lifecycle-only mode")
    parser.add_argument("--port", type=int, help="Target UDP game port")
    parser.add_argument("--seconds", type=float, default=8, help="Receive deadline, 0 < seconds <= 9")
    args = parser.parse_args()
    if (args.host is None) != (args.port is None):
        parser.error("--host and --port must be supplied together")
    if args.host is not None:
        try:
            args.host = str(ipaddress.IPv4Address(args.host))
        except ipaddress.AddressValueError:
            parser.error("--host must be a literal IPv4 address")
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not 0 < args.seconds <= 9:
        parser.error("--seconds must be greater than zero and at most nine")
    if not args.dll.is_absolute():
        parser.error("--dll must be an absolute path")
    if args.sha256.lower() not in SUPPORTED_DLL_HASHES:
        parser.error("This probe only supports the inspected DLL hashes")
    return args


def verify_dll(path, expected):
    # Hash bytes before any load; verify the PE architecture independently.
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected.lower():
        raise ValueError("dll_hash_mismatch")
    if data[:2] != b"MZ" or len(data) < 64:
        raise ValueError("dll_not_pe")
    pe = struct.unpack_from("<I", data, 60)[0]
    if pe + 26 > len(data) or data[pe:pe + 4] != b"PE\0\0":
        raise ValueError("dll_not_pe")
    machine = struct.unpack_from("<H", data, pe + 4)[0]
    magic = struct.unpack_from("<H", data, pe + 24)[0]
    if machine != 0x8664 or magic != 0x20B:
        raise ValueError("dll_not_x64_pe32plus")


def load_api(path):
    # On Windows x64, C and stdcall share the x64 calling convention. c_bool
    # reads the native bool in AL, as verified at NET_Receive RVA 0x1d84.
    api = ctypes.WinDLL(str(path.resolve()), winmode=0x1100)
    signatures = {
        "NET_Create": (ctypes.c_void_p, []),
        "NET_Close": (None, [ctypes.c_void_p]),
        "NET_StartClient": (ctypes.c_int32, [ctypes.c_void_p, ctypes.c_char_p] + [ctypes.c_int32] * 4),
        "NET_Receive": (ctypes.c_bool, [ctypes.c_void_p]),
        "NETRCV_LengthBits": (ctypes.c_int32, [ctypes.c_void_p]),
        "NETRCV_RawData": (ctypes.c_void_p, [ctypes.c_void_p]),
    }
    for name, (result_type, argument_types) in signatures.items():
        function = getattr(api, name)
        function.restype = result_type
        function.argtypes = argument_types
    return api


def probe(args):
    result = {
        "dllSha256": args.sha256.lower(),
        "abi": "windows-x64",
        "mode": "transport_probe" if args.host else "lifecycle_only",
        "created": False,
        "closed": False,
        "stages": [],
        "receivedPackets": 0,
        "bitLengthCounts": {},
        "firstByteCounts": {},
    }
    if sys.platform != "win32" or struct.calcsize("P") != 8:
        raise ValueError("requires_64bit_windows_python")
    verify_dll(args.dll, args.sha256)
    api = load_api(args.dll)
    peer = None
    lengths, first_bytes = Counter(), Counter()
    started = time.monotonic()
    try:
        peer = api.NET_Create()
        if not peer:
            result["stages"].append("native_create_failed")
            return result
        result["created"] = True
        result["stages"].append("native_wrapper_created")
        if not args.host:
            return result

        # No password/key, one ephemeral IPv4 socket, one outgoing peer. The
        # three timing values correspond to the fixed Connect signature.
        startup = api.NET_StartClient(peer, args.host.encode("ascii"), args.port, 12, 500, 0)
        result["startClientResult"] = startup
        if startup:
            result["stages"].append("native_start_failed" if startup == 1 else "native_connect_start_failed")
            return result
        result["stages"].append("transport_connect_started")
        deadline = started + args.seconds
        while time.monotonic() < deadline:
            if not api.NET_Receive(peer):
                time.sleep(0.005)
                continue
            bits = api.NETRCV_LengthBits(peer)
            # Malformed length is recorded without dereferencing a pointer.
            if bits < 1:
                result["stages"].append("invalid_receive_length")
                break
            pointer = api.NETRCV_RawData(peer)
            if not pointer:
                result["stages"].append("null_receive_data")
                break
            first = ctypes.c_ubyte.from_address(pointer).value
            lengths[bits] += 1
            first_bytes[first] += 1
            result["receivedPackets"] += 1
            stage = TRANSPORT_NOTIFICATIONS.get(first)
            if stage and stage not in result["stages"]:
                result["stages"].append(stage)
            if first in {17, 20, 21, 22, 23, 24, 25}:
                break
        else:
            result["stages"].append("receive_deadline_reached")
        return result
    finally:
        result["bitLengthCounts"] = {str(k): v for k, v in sorted(lengths.items())}
        result["firstByteCounts"] = {f"0x{k:02x}": v for k, v in sorted(first_bytes.items())}
        if peer:
            api.NET_Close(peer)
            result["closed"] = True
            result["stages"].append("native_wrapper_closed")
        result["elapsedSeconds"] = round(time.monotonic() - started, 3)


def main():
    args = parse_args()
    try:
        result = probe(args)
    except (OSError, ValueError, AttributeError) as error:
        # Never print exception messages that may include a local path/host.
        print(json.dumps({"error": type(error).__name__, "stage": "probe_setup_or_native_call"}))
        return 1
    print(json.dumps(result, indent=2))
    return 0 if result["created"] and result["closed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
