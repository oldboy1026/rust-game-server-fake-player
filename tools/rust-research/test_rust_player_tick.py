"""Offline wake lifecycle and real-protobuf-zero regressions; synthetic input."""
import copy
import importlib.util
from pathlib import Path
import struct
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("wake_worker", Path(__file__).with_name("rust-peer.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
tick = worker.player_tick


def varint(value):
    result = bytearray()
    while value >= 128:
        result.append((value % 128) + 128)
        value //= 128
    return bytes(result + bytes([value]))


def scalar(number, value):
    return varint(number * 8) + varint(value)


def message(number, value):
    return varint(number * 8 + 2) + varint(len(value)) + value


def floating(number, value):
    return varint(number * 8 + 5) + struct.pack("<f", value)


def vector(value):
    # Match the ordinary full serializer: zero components are absent.
    return b"".join(floating(i, component) for i, component in enumerate(value, 1) if component != 0)


def entity(seq=1, uid=9, *, flags=272, life=0, model_flags=12,
           pos=(0.0, 20.0, 0.0), angles=(0.0, 90.0, 0.0), mounted=0,
           parent=0, extra_model=b"", health=100.0, time=10.0, user=1):
    model = (scalar(11, model_flags) if model_flags else b"") + extra_model
    player = scalar(2, user) + message(6, model) + scalar(7, flags)
    if mounted:
        player += scalar(22, mounted)
    result = (message(1, scalar(1, uid))
              + message(2, message(1, vector(pos)) + message(2, vector(angles)) + floating(4, time))
              + message(3, player))
    if parent:
        result += message(10, scalar(1, parent))
    combat = (scalar(1, life) if life else b"") + floating(2, health)
    return b"\x91" + struct.pack("<I", seq) + result + message(24, combat)


def observe(controller, packet, now=0.0):
    observed = worker.self_entity_snapshot(packet, 1)
    if observed is not None:
        return controller.observe(packet, observed, now)
    return False


def decode_tree(data, schema):
    """Independent wire reader for assertions, preserving every explicit zero."""
    result = {}
    for number, wire, value in worker.proto_fields(data):
        if number in schema:
            result[number] = decode_tree(value, schema[number])
        elif wire == 5:
            result[number] = struct.unpack("<f", value)[0]
        else:
            result[number] = value
    return result


class WakeTests(unittest.TestCase):
    def ready(self, packet=None):
        controller = tick.WakeController(True, worker.proto_fields)
        observe(controller, packet or entity())
        controller.finish_loading(9)
        return controller

    def sender(self):
        packets = []
        def send(payload):
            packets.append(bytes(payload))
            return True
        return packets, send

    def test_full_message_omits_alive_and_zero_components(self):
        controller = self.ready(entity(pos=(0, 0, 0), angles=(0, 0, 0)))
        packets, send = self.sender()
        controller.step(0.0, send)
        self.assertEqual(len(packets), 1)
        schema = {1: {2: {}, 3: {}}, 2: {}, 4: {n: {} for n in tick.MODEL_VECTORS}, 6: {}}
        decoded = decode_tree(packets[0][1:], schema)
        self.assertEqual(decoded[2], {1: 0, 2: 0, 3: 0})
        self.assertEqual(decoded[6], {1: 0, 2: 1.5, 3: 0})
        self.assertEqual(decoded[1][1], 0)
        self.assertEqual(decoded[1][3], {1: 0, 2: 0, 3: 0})
        self.assertEqual(set(decoded[4]), tick.MODEL_FIELDS)
        self.assertEqual(decoded[4][11], 4)
        self.assertEqual([decoded[n] for n in (5, 7, 8)], [0, 0, 50])

    def test_neutral_press_release_bounded_even_without_acknowledgement(self):
        controller = self.ready()
        packets, send = self.sender()
        for now in (0, 0.02, 0.05, 0.08, 0.10, 0.15, 1, 5.11, 60):
            self.assertIsNone(controller.step(now, send))
        inputs = [decode_tree(packet[1:], {1: {2: {}, 3: {}}})[1][1] for packet in packets]
        self.assertEqual(inputs, [0, 64, 0])
        self.assertTrue(controller.metadata["wakeReleaseSent"])
        self.assertFalse(controller.metadata["wakeAwakeObserved"])
        self.assertEqual(controller.metadata["wakeState"], "unconfirmed")

    def test_only_new_same_entity_awake_snapshot_confirms_after_press(self):
        controller = self.ready()
        packets, send = self.sender()
        controller.step(0, send)
        controller.step(0.05, send)
        self.assertFalse(observe(controller, entity(seq=1, flags=256), 0.06))
        self.assertFalse(observe(controller, entity(seq=2, flags=256, user=2), 0.07))
        self.assertFalse(controller.metadata["wakeAwakeObserved"])
        self.assertTrue(observe(controller, entity(seq=3, flags=256), 0.08))
        self.assertTrue(controller.metadata["wakeAwakeObserved"])
        self.assertFalse(controller.metadata["wakeReleaseSent"])
        controller.step(0.10, send)
        self.assertEqual(controller.metadata["wakeState"], "awake_observed")
        observe(controller, entity(seq=4, flags=256), 0.12)
        self.assertEqual(controller.take_events().count("wake_awake_observed"), 1)

    def test_replacement_cannot_confirm_prior_entity_wake(self):
        controller = self.ready()
        _, send = self.sender()
        for now in (0, 0.05, 0.1):
            controller.step(now, send)
        observe(controller, entity(seq=2, uid=10, flags=256), 0.12)
        self.assertFalse(controller.metadata["wakeAwakeObserved"])
        self.assertEqual(controller.metadata["wakeState"], "interrupted")

    def test_no_ticks_without_finish_or_with_expired_state(self):
        controller = tick.WakeController(True, worker.proto_fields)
        packets, send = self.sender()
        controller.step(0, send)
        observe(controller, entity())
        controller.finish_loading(10)
        controller.step(0, send)
        self.assertEqual(controller.metadata["wakeState"], "waiting_finish_loading")
        controller.finish_loading(9)
        controller.step(3, send)
        self.assertEqual(controller.metadata["wakeState"], "stale_state")
        self.assertEqual(packets, [])

    def test_disabled_and_already_awake_send_nothing(self):
        packets, send = self.sender()
        disabled = tick.WakeController(False, worker.proto_fields)
        observe(disabled, entity())
        disabled.finish_loading(9)
        disabled.step(0, send)
        awake = self.ready(entity(flags=256))
        awake.step(0, send)
        self.assertEqual(awake.metadata["wakeState"], "already_awake")
        self.assertEqual(packets, [])

    def test_unsupported_state_blocks_sending(self):
        cases = [dict(mounted=1), dict(parent=1), dict(flags=272 | 8),
                 dict(flags=272 | 32), dict(flags=272 | 64), dict(flags=16),
                 dict(flags=272 | 33554432), dict(life=1), dict(health=0),
                 dict(model_flags=0), dict(model_flags=12 | 64),
                 dict(extra_model=floating(20, float("nan"))),
                 dict(extra_model=floating(20, 1.1)),
                 dict(extra_model=message(13, vector((1, 0, 0))))]
        for change in cases:
            with self.subTest(change=change):
                controller = self.ready(entity(**change))
                packets, send = self.sender()
                controller.step(0, send)
                self.assertEqual(packets, [])
                self.assertEqual(controller.metadata["wakeState"], "unsupported_state")

    def test_unmounted_pose_value_is_preserved_after_prior_mount(self):
        # Actual full captures retained mount pose 11 after dismounting. A
        # nonzero pose alone is not a current parent/mount or a changed eye height.
        controller = self.ready(entity(extra_model=scalar(12, 11)))
        packets, send = self.sender()
        controller.step(0, send)
        decoded = decode_tree(packets[0][1:], {4: {n: {} for n in tick.MODEL_VECTORS}})
        self.assertEqual(decoded[4][12], 11)

    def test_unsequenced_and_reordered_snapshots_cannot_authorize(self):
        controller = self.ready(entity(seq=0xffffffff))
        packets, send = self.sender()
        controller.step(0, send)
        self.assertEqual(packets, [])
        self.assertEqual(controller.metadata["wakeState"], "unsequenced_state")
        observe(controller, entity(seq=5), 0.1)
        self.assertFalse(observe(controller, entity(seq=4, mounted=1), 0.11))
        controller.step(0.12, send)
        self.assertEqual(len(packets), 1)

    def test_replacement_requires_new_finish_loading(self):
        controller = self.ready()
        observe(controller, entity(seq=2, uid=10), 0.1)
        packets, send = self.sender()
        controller.step(0.1, send)
        self.assertEqual(packets, [])
        controller.finish_loading(10)
        controller.step(0.1, send)
        self.assertEqual(len(packets), 1)

    def test_unknown_rpc_or_correction_after_press_requires_close(self):
        controller = self.ready()
        packets, send = self.sender()
        controller.step(0, send)
        controller.step(0.05, send)
        controller.invalidate()
        self.assertEqual(controller.step(0.1, send), "wake_release_unavailable")
        self.assertEqual(len(packets), 2)
        self.assertFalse(controller.metadata["wakeReleaseSent"])

    def test_stalled_worker_never_replays_press_or_unsafe_release(self):
        for phase in (1, 2):
            controller = self.ready()
            packets, send = self.sender()
            controller.step(0, send)
            if phase == 2:
                controller.step(0.05, send)
            result = controller.step(0.5, send)
            self.assertEqual(result, "wake_release_unavailable" if phase == 2 else None)
            self.assertEqual(len(packets), phase)

    def test_send_failure_stops_connection_and_never_retries(self):
        controller = self.ready()
        self.assertEqual(controller.step(0, lambda payload: False), "tick_native_send_failed")
        packets, send = self.sender()
        controller.step(0.1, send)
        self.assertEqual(packets, [])
        self.assertEqual(controller.metadata["tickPacketsSent"], 0)

    def test_release_send_failure_remains_visible_after_shutdown(self):
        controller = self.ready()
        _, send = self.sender()
        controller.step(0, send)
        controller.step(0.05, send)
        self.assertEqual(controller.step(0.10, lambda payload: False), "tick_native_send_failed")
        controller.shutdown()
        self.assertEqual(controller.metadata["wakeState"], "send_failed")
        self.assertFalse(controller.metadata["wakeReleaseSent"])
        self.assertEqual(controller.metadata["tickPacketsSent"], 2)

    def test_public_metadata_contains_no_transforms_or_raw_identity(self):
        controller = self.ready()
        self.assertNotIn("position", controller.metadata)
        self.assertNotIn("uid", controller.metadata)
        self.assertNotIn("angles", controller.metadata)
        self.assertIn(controller.metadata["wakeState"], tick.WAKE_STATES)

    def test_recognized_owner_metadata_and_view_rpc_do_not_interrupt_wake(self):
        controller = self.ready()
        _, send = self.sender()
        controller.step(0, send)
        pet_rpc = b"\x95" + struct.pack("<QI", 9, tick._rpc_id("CLIENT_SetPetPrefabID")) + bytes(12)
        self.assertTrue(controller.receive_own_rpc(pet_rpc))
        view_rpc = b"\x95" + struct.pack("<QIfff", 9, tick.FORCE_VIEW_RPC, 10, 20, 30)
        self.assertTrue(controller.receive_own_rpc(view_rpc))
        self.assertEqual(controller._private["angles"], (10, 20, 30))
        self.assertFalse(controller.receive_own_rpc(b"\x95" + struct.pack("<QI", 10, tick.FORCE_VIEW_RPC) + bytes(12)))
        self.assertFalse(controller.receive_own_rpc(b"\x95" + struct.pack("<QI", 9, 12345)))
        self.assertFalse(controller.receive_own_rpc(view_rpc[:-1]))
        self.assertEqual(controller.metadata["wakeState"], "sending")

    def test_position_and_base_flags_echo_are_not_a_correction_or_full_state_refresh(self):
        controller = self.ready()
        initial_received = controller._private["received"]
        echo = b"\x96" + struct.pack("<Qfffffff", 9, 0, 20, 0, 0, 90, 0, 20)
        self.assertTrue(controller.receive_position_echo(echo))
        self.assertEqual(controller._private["received"], initial_received)
        self.assertTrue(controller.receive_flags_echo(b"\xa3" + struct.pack("<QI", 9, 0)))
        self.assertFalse(controller.receive_flags_echo(b"\xa3" + struct.pack("<QI", 9, 1)))
        self.assertFalse(controller.receive_position_echo(b"\x96" + struct.pack("<Qfffffff", 9, 1, 20, 0, 0, 90, 0, 20)))
        self.assertFalse(controller.receive_position_echo(echo + struct.pack("<Q", 1)))


class ConnectionKeepAliveTests(unittest.TestCase):
    def test_requires_own_entity_and_first_tick(self):
        controller = tick.ConnectionKeepAlive(True)
        sent = []
        sender = lambda payload: sent.append(bytes(payload)) or True
        controller.step(0, 9, False, sender)
        controller.step(0, None, True, sender)
        tick.ConnectionKeepAlive(False).step(0, 9, True, sender)
        self.assertEqual(sent, [])
        controller.step(0, 9, True, sender)
        self.assertEqual(sent, [b"\x95" + struct.pack("<QI", 9, 935768323)])

    def test_cadence_stays_below_server_stall_threshold(self):
        controller = tick.ConnectionKeepAlive(True)
        packets = []
        sender = lambda payload: packets.append(bytes(payload)) or True
        for now in (0, 0.04, 0.10, 0.14, 0.21, 0.50, 0.51):
            self.assertIsNone(controller.step(now, 9, True, sender))
        self.assertEqual(len(packets), 4)
        self.assertEqual(controller.sent, 4)

    def test_stalled_scheduler_stops_without_catchup_packets(self):
        controller = tick.ConnectionKeepAlive(True)
        packets = []
        sender = lambda payload: packets.append(bytes(payload)) or True
        controller.step(0, 9, True, sender)
        self.assertEqual(controller.step(1, 9, True, sender), "connection_keepalive_stalled")
        self.assertEqual(len(packets), 1)

    def test_send_failure_is_explicit(self):
        controller = tick.ConnectionKeepAlive(True)
        self.assertEqual(controller.step(0, 9, True, lambda payload: False), "connection_keepalive_send_failed")
        self.assertEqual(controller.sent, 0)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--write-interop":
        output = Path(sys.argv[2])
        output.mkdir(parents=True, exist_ok=True)
        controller = WakeTests().ready(entity(extra_model=scalar(12, 11)))
        for index, buttons in enumerate((0, 64, 0)):
            (output / f"tick-{index}.bin").write_bytes(tick.encode_tick(controller._private, buttons))
    else:
        unittest.main()
