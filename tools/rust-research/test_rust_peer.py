"""Offline worker lifecycle regressions using a Python-only fake native API.

No game DLL is loaded, no socket is opened, and all identity input is synthetic.
Run: python tools/rust-research/test_rust_peer.py
"""
import copy
import ctypes
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import threading
import types
import unittest
from unittest.mock import patch
from test_rust_player_tick import entity

sys.dont_write_bytecode = True
WORKER_PATH = Path(__file__).with_name("rust-peer.py")
SPEC = importlib.util.spec_from_file_location("rust_peer_under_test", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)
INITIAL_RESULT = copy.deepcopy(worker.RESULT)


class Function:
    """Accept ctypes signature assignments without invoking native code."""
    def __init__(self, function):
        self.function = function

    def __call__(self, *args):
        return self.function(*args)


class ControlStream:
    def __init__(self):
        self.identity_read = False
        self.release = threading.Event()
        self.reader = None

    def readline(self, limit):
        if not self.identity_read:
            self.identity_read = True
            return (b'{"steamId":"1","username":"synthetic-private-name",'
                    b'"sessionTicketBase64":"c3ludGhldGljLXRpY2tldA=="}\n')
        self.reader = threading.current_thread()
        self.release.wait(5)
        return b""

    def finish(self):
        self.release.set()
        if self.reader is not None:
            self.reader.join(timeout=2)
            if self.reader.is_alive():
                raise AssertionError("Synthetic control reader did not finish")


class FakeApi:
    def __init__(self, packets, clock, codec=None):
        self.packets = iter(packets)
        self.clock = clock
        self.codec = codec
        self.current = None
        self.close_calls = 0
        self.send_calls = 0
        self.payloads = []
        self.send_args = []
        self.last_player_response = None
        self.sleeping = True
        self.keepalives_accepted = 0
        self.keepalives_stalled = 0
        self.NET_Create = Function(lambda: 1)
        self.NET_StartClient = Function(lambda *args: 0)
        self.NET_Receive = Function(self.receive)
        self.NETRCV_LengthBits = Function(lambda peer: len(self.current.raw) * 8)
        self.NETRCV_RawData = Function(lambda peer: ctypes.addressof(self.current))
        self.NETRCV_GUID = Function(lambda peer: 1)
        self.NETSND_Start = Function(lambda peer: None)
        self.NETSND_WriteBytes = Function(self.write_bytes)
        self.NETSND_Send = Function(self.send)
        self.NET_Close = Function(self.close)

    def receive(self, peer):
        packet = next(self.packets)
        if packet is None:
            self.clock[0] += 0.05
            if self.last_player_response is not None and self.clock[0] - self.last_player_response > 60:
                packet = rejected("Unresponsive")
                if self.codec:
                    packet = bytes(self.codec.transform(packet))
                self.current = ctypes.create_string_buffer(packet, len(packet))
                return True
            return False
        if packet[0] == 0x91:
            state = worker.self_entity_snapshot(self.codec.transform(packet) if self.codec else packet, 1)
            if state is not None:
                self.sleeping = bool(state["flags"] & 16)
        self.current = ctypes.create_string_buffer(packet, len(packet))
        return True

    def write_bytes(self, peer, data, length):
        payload = bytes(data[:length])
        self.payloads.append(payload)
        if self.codec:
            payload = self.codec.transform(payload)
        if payload[0] == 0x9b:
            self.last_player_response = self.clock[0]
        elif (payload[0] == 0x95 and len(payload) == 13
              and struct.unpack_from("<I", payload, 9)[0] == worker.player_tick.KEEP_ALIVE_RPC_ID):
            # BaseEntity.SV_RPCMessage drops a stalled player's RPC before
            # ClientKeepConnectionAlive can update lastTickTime. Sleeping
            # players are exempt; the awake case must be tested separately.
            if (not self.sleeping and self.last_player_response is not None
                    and self.clock[0] - self.last_player_response > 0.8):
                self.keepalives_stalled += 1
            else:
                self.keepalives_accepted += 1
                self.last_player_response = self.clock[0]

    def send(self, *args):
        self.send_calls += 1
        self.send_args.append(args)
        return 1

    def close(self, peer):
        self.close_calls += 1

def rejected(reason):
    data = reason.encode("utf-8")
    return b"\x9a" + struct.pack("<I", len(data)) + data


class WorkerExitTests(unittest.TestCase):
    def run_worker(self, packets, *, wake=False, entered=False, sha256="unused", codec=None):
        worker.RESULT = copy.deepcopy(INITIAL_RESULT)
        worker.PROGRESS = None
        clock = [0.0]
        api = FakeApi(packets, clock, codec)
        stream = ControlStream()
        stdin = types.SimpleNamespace(buffer=types.SimpleNamespace(raw=stream))
        args = types.SimpleNamespace(dll=Path("synthetic-not-a-dll"), sha256=sha256,
                                     host="127.0.0.1", port=1, seconds=1,
                                     persistent=True, stream=True, respawn_on_dead=False,
                                     no_ready=False, validate_input=False, wake_on_connect=wake)
        output = io.StringIO()
        try:
            with patch.object(worker, "parse_args", return_value=args), \
                    patch.object(worker.sys, "stdin", stdin), \
                    patch.object(worker.sys, "stdout", output), \
                    patch.object(worker.time, "monotonic", side_effect=lambda: clock[0]), \
                    patch.object(worker.time, "sleep"), \
                    patch.object(worker.native, "verify_dll") as verify, \
                    patch.object(worker.native, "load_api", return_value=api) as load:
                code = worker.main()
                verify.assert_called_once_with(args.dll, args.sha256)
                load.assert_called_once_with(args.dll)
        finally:
            stream.finish()
        text = output.getvalue()
        self.assertNotIn("synthetic-private-name", text)
        self.assertNotIn("synthetic-ticket", text)
        messages = [json.loads(line) for line in text.splitlines()]
        finals = [message for message in messages if message.get("type") == "final"]
        self.assertEqual(len(finals), 1)
        final = finals[0]
        self.assertEqual(code, 0)
        self.assertEqual(api.close_calls, 1)
        self.assertTrue(final["closed"])
        self.assertEqual(final["playerConnected"], entered)
        self.assertFalse(final["eacVerified"])
        return final, messages, api

    def test_classified_rejections_close_with_final_and_exit_zero(self):
        cases = [
            ("Steam Auth: Invalid ticket", "steam_auth"),
            ("EAC Authentication failed", "eac_required"),
            ("Server is full", "server_full"),
            ("Wrong connection protocol", "protocol_mismatch"),
            ("You are banned", "banned"),
            ("Unresponsive", "player_timeout"),
            ("Steam Auth Error: AuthTicketAlreadyUsed", "steam_ticket_reused"),
            ("synthetic-unrecognised-private-rejection", "unknown"),
        ]
        for reason, category in cases:
            with self.subTest(category=category):
                final, messages, api = self.run_worker([b"\x10", rejected(reason)])
                self.assertEqual(final["disconnectCategory"], category)
                self.assertEqual(final["stages"].count("disconnect_reason_received"), 1)
                self.assertIn("native_wrapper_closed", final["stages"])
                self.assertFalse(final["identitySent"])
                self.assertEqual(api.send_calls, 0)
                self.assertNotIn(reason, json.dumps(messages))

    def test_connection_limits_use_stage_supported_by_existing_parent(self):
        for reason in ("Too many connections from the same IP (limit 5)", "Connection rate limit"):
            with self.subTest(reason=reason):
                final, _, api = self.run_worker([b"\x10", rejected(reason)])
                self.assertIn("transport_connection_rate_limited", final["stages"])
                self.assertIn("disconnect_reason_received", final["stages"])
                # Existing parent's generic rejection precedes stage errors;
                # do not let category=other mask its supported limit stage.
                self.assertNotIn("disconnectCategory", final)
                self.assertEqual(api.send_calls, 0)
                parent = WORKER_PATH.parents[2] / "steam-multi-account/src/rust-session.js"
                self.assertIn("['transport_connection_rate_limited',", parent.read_text(encoding="utf-8"))

    def test_malformed_rejection_remains_unknown_without_local_failure(self):
        final, _, api = self.run_worker([b"\x10", b"\x9a\x05\x00\x00\x00x"])
        self.assertEqual(final["disconnectCategory"], "unknown")
        self.assertEqual(api.send_calls, 0)

    def test_eac_requirement_still_stops_without_sending_identity(self):
        final, _, api = self.run_worker([b"\x10", b"\xa2"])
        self.assertIn("eac_required", final["stages"])
        self.assertFalse(final["identitySent"])
        self.assertFalse(final["readySent"])
        self.assertEqual(api.send_calls, 0)

    def test_dedicated_profile_reports_selected_hash_and_preserves_eac_stop(self):
        sha256 = "a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21"
        argv = [str(WORKER_PATH), "--dll", str(WORKER_PATH.resolve()), "--sha256", sha256,
                "--host", "127.0.0.1", "--port", "1"]
        with patch.object(sys, "argv", argv):
            self.assertEqual(worker.parse_args().sha256, sha256)
        with patch.object(sys, "argv", [*argv[:4], "0" * 64, *argv[5:]]), \
                patch.object(sys, "stderr", io.StringIO()):
            with self.assertRaises(SystemExit):
                worker.parse_args()
        final, messages, api = self.run_worker([b"\x10", b"\xa2"], sha256=sha256)
        self.assertEqual(final["dllSha256"], sha256)
        self.assertTrue(all(message["dllSha256"] == sha256 for message in messages))
        self.assertIn("eac_required", final["stages"])
        self.assertEqual(api.send_calls, 0)

    def test_protected_approval_still_stops_before_ready(self):
        final, _, api = self.run_worker([b"\x10", b"\x9d", b"\x8f\x60\x02"])
        self.assertIn("protected_or_unsupported_encryption_required", final["stages"])
        self.assertTrue(final["identitySent"])
        self.assertFalse(final["readySent"])
        self.assertEqual(api.send_calls, 1)

    def test_enabled_worker_sends_three_ticks_and_observes_wake(self):
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        final, _, api = self.run_worker([
            b"\x10", b"\x9d", b"\x8f", entity(), finish, None,
            entity(seq=2, flags=256), None, b"\x15",
        ], wake=True, entered=True)
        self.assertEqual([p[0] for p in api.payloads], [0x9e, 0x90, 0x9b, 0x95, 0x9b, 0x9b, 0x95])
        self.assertTrue(all(args[2:] == (2, 3, 0) for args in api.send_args[2:]))
        self.assertEqual(final["tickPacketsSent"], 3)
        self.assertTrue(final["wakeAwakeObserved"])
        self.assertTrue(final["wakeReleaseSent"])
        self.assertEqual(final["wakeState"], "awake_observed")
        self.assertEqual(final["sentPackets"], 7)
        self.assertEqual(final["connectionKeepAliveSent"], 2)

    def test_level_one_decodes_own_snapshot_and_finish_loading_and_encodes_ticks(self):
        codec = worker.packet_codec.PacketCodec(worker.BUILD_PROTOCOL)
        codec.select(1)
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        frames = [b"\x10", b"\x9d", b"\x8f\x60\x01", entity(), finish, None,
                  entity(seq=2, flags=256), None, b"\x15"]
        wire = [bytes(codec.transform(frame)) if frame is not None else None for frame in frames]
        final, _, api = self.run_worker(wire, wake=True, entered=True, codec=codec)
        self.assertEqual(final["encryptionLevel"], 1)
        self.assertTrue(final["readySent"])
        self.assertEqual(final["tickPacketsSent"], 3)
        self.assertTrue(final["wakeAwakeObserved"])
        self.assertGreater(final["connectionKeepAliveSent"], 0)
        self.assertFalse(final["eacVerified"])
        rpc = next(frame for frame in api.payloads if frame[0] == 0x95)
        self.assertNotEqual(struct.unpack_from("<Q", rpc, 1)[0], 9)
        self.assertEqual(struct.unpack_from("<Q", codec.transform(rpc), 1)[0], 9)

    def test_level_one_never_treats_other_entity_finish_as_own_or_bypasses_eac(self):
        codec = worker.packet_codec.PacketCodec(worker.BUILD_PROTOCOL)
        codec.select(1)
        wrong_finish = b"\x95" + struct.pack("<QI", 10, worker.FINISH_LOADING_RPC_ID)
        for last in (wrong_finish, b"\xa2"):
            frames = [b"\x10", b"\x9d", b"\x8f\x60\x01", entity(), last, b"\x15"]
            wire = [bytes(codec.transform(frame)) for frame in frames]
            final, _, api = self.run_worker(wire, codec=codec)
            self.assertTrue(final["selfEntityObserved"])
            self.assertFalse(final["finishLoadingObserved"])
            self.assertEqual(api.send_calls, 2)
            if last == b"\xa2":
                self.assertIn("eac_required", final["stages"])

    def test_enabled_worker_stops_on_own_position_change_while_pressed(self):
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        correction = b"\x96" + struct.pack("<Q", 9) + bytes(28)
        final, _, api = self.run_worker([
            b"\x10", b"\x9d", b"\x8f", entity(), finish, None, correction,
        ], wake=True, entered=True)
        self.assertEqual(final["tickPacketsSent"], 2)
        self.assertFalse(final["wakeReleaseSent"])
        self.assertIn("wake_release_unavailable", final["stages"])
        self.assertEqual(final["wakeState"], "interrupted")

    def test_wake_enabled_does_not_change_protected_session_rejection(self):
        for packets in ([b"\x10", b"\xa2"], [b"\x10", b"\x9d", b"\x8f\x60\x02"]):
            final, _, api = self.run_worker(packets, wake=True)
            self.assertEqual(final["tickPacketsSent"], 0)
            self.assertFalse(any(p[0] == 0x9b for p in api.payloads))
            self.assertFalse(final["readySent"])

    def test_connection_maintenance_survives_interrupted_wake_beyond_server_timeout(self):
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        own_rpc = b"\x95" + struct.pack("<QI", 9, 12345)
        final, _, api = self.run_worker([
            b"\x10", b"\x9d", b"\x8f", entity(), finish, own_rpc,
            *([None] * 1700), b"\x15",
        ], wake=True, entered=True)
        self.assertGreater(final["elapsedSeconds"], 80)
        self.assertNotIn("disconnect_reason_received", final["stages"])
        self.assertGreater(final["connectionKeepAliveSent"], 35)
        self.assertEqual(final["tickPacketsSent"], 1)
        self.assertEqual(final["wakeInterruptionReason"], "self_rpc")
        self.assertEqual(final["wakeInterruptionRpc"], 12345)
        self.assertFalse(final["wakeAwakeObserved"])

    def test_expected_owner_metadata_and_position_echo_allow_wake_cycle_to_finish(self):
        tick = worker.player_tick
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        pet = b"\x95" + struct.pack("<QI", 9, tick._rpc_id("CLIENT_SetPetPrefabID")) + bytes(12)
        view = b"\x95" + struct.pack("<QIfff", 9, tick.FORCE_VIEW_RPC, 0, 90, 0)
        position = b"\x96" + struct.pack("<Qfffffff", 9, 0, 20, 0, 0, 90, 0, 10)
        flags = b"\xa3" + struct.pack("<QI", 9, 0)
        final, _, _ = self.run_worker([
            b"\x10", b"\x9d", b"\x8f", entity(), finish, pet, view, position,
            None, flags, None, entity(seq=2, flags=256), b"\x15",
        ], wake=True, entered=True)
        self.assertEqual(final["tickPacketsSent"], 3)
        self.assertTrue(final["wakeAwakeObserved"])
        self.assertNotIn("wake_interrupted", final["stages"])

    def test_awake_connection_maintenance_prevents_sixty_second_timeout(self):
        final, _, api = self.run_worker(self.awake_packets(), wake=True, entered=True)
        self.assertGreater(final["elapsedSeconds"], 80)
        self.assertEqual(final["wakeState"], "awake_observed")
        self.assertEqual(final["tickPacketsSent"], 3)
        self.assertGreater(api.keepalives_accepted, 400)
        self.assertEqual(api.keepalives_stalled, 0)
        self.assertNotIn("disconnect_reason_received", final["stages"])

    def test_two_second_rpc_interval_reproduces_stall_then_timeout(self):
        # Disable the new local gap guard to reproduce the old proposal. Native
        # sends succeed, but the server ignores them and kicks after 60s.
        with patch.object(worker.player_tick, "KEEP_ALIVE_INTERVAL", 2.0), \
                patch.object(worker.player_tick, "KEEP_ALIVE_MAX_GAP", 3.0):
            final, _, api = self.run_worker(self.awake_packets(), wake=True, entered=True)
        self.assertEqual(final["disconnectCategory"], "player_timeout")
        self.assertGreater(api.keepalives_stalled, 20)
        self.assertLess(final["elapsedSeconds"], 62)

    @staticmethod
    def awake_packets():
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        return [b"\x10", b"\x9d", b"\x8f", entity(), finish, None, None,
                entity(seq=2, flags=256), *([None] * 1700), b"\x15"]


if __name__ == "__main__":
    unittest.main()
