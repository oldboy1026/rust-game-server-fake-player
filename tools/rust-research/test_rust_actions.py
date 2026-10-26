"""Offline action bounds, ordering, correction, key release and protected peers."""
import copy
import io
import json
import queue
import struct
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from test_rust_peer import worker, FakeApi, INITIAL_RESULT
from test_rust_player_tick import entity, decode_tree


class ActionTests(unittest.TestCase):
    def ready(self, packet=None):
        controller = worker.actions.ActionController(worker.player_tick, worker.proto_fields)
        self.observe(controller, packet or entity(flags=256, model_flags=4))
        controller.finish_loading(9)
        return controller

    def observe(self, controller, packet, now=0):
        return controller.observe(packet, worker.self_entity_snapshot(packet, 1), now)

    def submit(self, controller, action, now=0, id=1, ready=True):
        packets = []
        sender = lambda packet: packets.append(bytes(packet)) or True
        controller.submit({'id': id, 'action': action, 'flatGround': True},
                          ready=ready, auto_busy=False, now=now, sender=sender)
        return packets, sender

    def test_short_walk_complete_delta_frames_and_explicit_release(self):
        for action, sign in [('forward', 1), ('backward', -1)]:
            c = self.ready()
            packets, send = self.submit(c, action)
            for index in range(6):
                self.assertIsNone(c.step(index * .051, send))
            self.assertEqual(len(packets), 6)
            decoded = [decode_tree(p[1:], {1: {2: {}, 3: {}}, 2: {}, 4: {}, 6: {}}) for p in packets]
            self.assertEqual(decoded[0][1][1], 0)
            self.assertEqual(decoded[-1][1][1], 0)
            self.assertAlmostEqual(decoded[-1][2][1], sign * .28, places=6)
            self.assertTrue(all(abs(frame[2][1]) <= .280001 for frame in decoded))
            self.assertTrue(all(frame[2][2] == 20 for frame in decoded))
            self.assertEqual(c.metadata['lastAction']['status'], 'sent')
            self.assertIsNone(c.tracker._private)
            self.assertNotIn('position', json.dumps(c.metadata))
            c.step(6, send)
            self.assertEqual(c.metadata['lastAction']['status'], 'unconfirmed')

    def test_jump_bounded_arc_returns_to_same_point_with_neutral_input(self):
        c = self.ready(); packets, send = self.submit(c, 'jump')
        for index in range(16):
            c.step(index * .051, send)
        frames = [decode_tree(p[1:], {1: {}, 2: {}, 4: {}, 6: {}}) for p in packets]
        self.assertEqual(len(frames), 16)
        self.assertEqual([frame[1][1] for frame in frames].count(32), 1)
        self.assertEqual(frames[-1][1][1], 0)
        self.assertAlmostEqual(max(frame[2][2] for frame in frames), 21.5)
        self.assertEqual(frames[0][2], frames[-1][2])
        self.assertTrue(frames[8][4][11] & 2)
        self.assertFalse(frames[8][4][11] & 4)
        self.assertTrue(frames[-1][4][11] & 4)

    def test_missing_fresh_finish_or_supported_pose_never_sends(self):
        for packet, now, finish, action, expected in [
            (entity(flags=256, model_flags=4), 3, True, 'forward', 'stale_state'),
            (entity(flags=256), 0, False, 'jump', 'stale_state'),
            (entity(), 0, True, 'forward', 'unsupported_state'),
            (entity(flags=256, mounted=3), 0, True, 'jump', 'unsupported_state'),
            (entity(flags=256, health=0, life=1), 0, True, 'wake', 'unsupported_state'),
            (entity(flags=256), 0, True, 'respawn', 'unsupported_state'),
        ]:
            c = self.ready(packet)
            if not finish: c.tracker._finish = None
            packets, send = self.submit(c, action, now)
            c.step(now, send)
            self.assertEqual(packets, [])
            self.assertEqual(c.metadata['lastAction']['status'], expected)

    def test_reordered_and_unsequenced_snapshots_never_refresh_state(self):
        c = self.ready(entity(seq=5, flags=256, model_flags=4))
        self.assertFalse(self.observe(c, entity(seq=4, flags=256), 10))
        self.assertEqual(c._own_at, 0)
        self.observe(c, entity(seq=0xffffffff), 10)
        packets, send = self.submit(c, 'respawn', 10)
        self.assertEqual(c.metadata['lastAction']['status'], 'stale_state')

    def test_correction_stop_and_scheduler_stall_close_only_active_peer(self):
        for mode in ['correction', 'stop', 'stall', 'entity']:
            c = self.ready(); packets, send = self.submit(c, 'forward'); c.step(0, send)
            if mode == 'correction': c.invalidate('position_update')
            elif mode == 'stop': self.submit(c, 'stop', .01, id=2)
            elif mode == 'entity': self.observe(c, entity(seq=2, uid=10, flags=256), .01)
            result = c.step(1 if mode == 'stall' else .01, send)
            self.assertEqual(result, 'action_release_unavailable')
            self.assertEqual(len(packets), 1)
        c = self.ready(); packets, send = self.submit(c, 'stop')
        self.assertIsNone(c.step(0, send)); self.assertEqual(packets, [])

    def test_failed_send_closes_and_dead_respawn_is_single_fixed_command(self):
        c = self.ready(); self.submit(c, 'forward')
        self.assertEqual(c.step(0, lambda _: False), 'action_native_send_failed')
        c = self.ready(entity(flags=256, life=1, health=0))
        packets, send = self.submit(c, 'respawn')
        self.assertEqual(packets, [b'\x98\x07\x00\x00\x00respawn'])
        self.observe(c, entity(seq=2, flags=256), .1)
        self.assertEqual(c.metadata['lastAction']['status'], 'snapshot_observed')
        self.assertEqual(self.submit(c, 'respawn', .2, id=2)[0], [])

    def test_suicide_requires_explicit_confirmation_and_only_sends_own_kill(self):
        c = self.ready(); packets = []
        request = {'id': 1, 'action': 'suicide', 'flatGround': False}
        with self.assertRaises(ValueError): worker.actions.validate_request(request)
        request['confirmDeath'] = True
        c.submit(request, ready=True, auto_busy=False, now=0, sender=lambda p: packets.append(bytes(p)) or True)
        self.assertEqual(packets, [b'\x98\x04\x00\x00\x00kill'])
        self.observe(c, entity(seq=2, flags=256, life=1, health=0), .1)
        self.assertEqual(c.metadata['lastAction']['status'], 'snapshot_observed')

    def test_controller_accepts_newer_snapshot_at_walk_endpoint(self):
        c = self.ready(); packets, send = self.submit(c, 'forward')
        for i in range(6): c.step(i * .051, send)
        self.observe(c, entity(seq=2, flags=256, model_flags=4, pos=(.28, 20, 0)), .4)
        self.assertEqual(c.metadata['lastAction']['status'], 'snapshot_observed')

    def test_server_correction_to_start_is_not_mistaken_for_old_pose_echo(self):
        c = self.ready(); packets, send = self.submit(c, 'forward')
        c.step(0, send); c.step(.051, send)
        def position(x): return b'\x96' + struct.pack('<Qfffffff', 9, x, 20, 0, 0, 90, 0, 10)
        self.assertTrue(c.receive_position_echo(position(.07)))
        self.assertFalse(c.receive_position_echo(position(0)))
        c.invalidate('position_update')
        self.assertEqual(c.step(.102, send), 'action_release_unavailable')

    def test_control_reader_strict_fixed_actions_and_stop_precedence(self):
        state = {'actionQueue': queue.Queue(maxsize=1), 'chatQueue': queue.Queue(maxsize=1)}
        stop = threading.Event()
        worker.control_reader(io.BytesIO(b'{"action":{"id":1,"action":"jump","flatGround":true}}\n{"stop":true}\n'), stop, state)
        self.assertEqual(state['actionQueue'].get_nowait()['action'], 'jump')
        self.assertEqual(state['reason'], 'stop_requested')
        for body in [{}, {'id': True, 'action': 'jump', 'flatGround': True},
                     {'id': 1, 'action': [], 'flatGround': True},
                     {'id': 1, 'action': 'jump', 'flatGround': False},
                     {'id': 1, 'action': 'quit', 'flatGround': True}]:
            with self.assertRaises(ValueError): worker.actions.validate_request(body)

    def test_worker_manual_wake_maintains_connection_without_auto_wake(self):
        self.run_manual_wake(0)

    def test_worker_manual_wake_uses_level_one_codec_and_still_stops_for_eac(self):
        self.run_manual_wake(1, protected=True)

    def run_manual_wake(self, level, protected=False):
        worker.RESULT = copy.deepcopy(INITIAL_RESULT); worker.PROGRESS = None
        clock, control, output = [0.0], {}, io.StringIO()
        finish = b'\x95' + struct.pack('<QI', 9, worker.FINISH_LOADING_RPC_ID)
        codec = worker.packet_codec.PacketCodec(worker.BUILD_PROTOCOL)
        codec.select(level)
        wire_finish = bytes(codec.transform(finish))
        frames = [b'\x10', b'\x9d', b'\x8f\x60' + bytes([level]), entity(), finish, *([None] * 30), b'\xa2' if protected else b'\x15']
        wire = [bytes(codec.transform(frame)) if frame is not None else None for frame in frames]
        api = FakeApi(wire, clock, codec)
        receive = api.NET_Receive.function
        def receive_action(peer):
            found = receive(peer)
            if found and api.current.raw == wire_finish:
                control['state']['actionQueue'].put_nowait({'id': 1, 'action': 'wake', 'flatGround': False})
            return found
        api.NET_Receive.function = receive_action
        args = types.SimpleNamespace(dll=Path('synthetic'), sha256='unused', host='127.0.0.1', port=1,
                                     seconds=1, persistent=True, stream=True, respawn_on_dead=False,
                                     wake_on_connect=False, no_ready=False, validate_input=False)
        stdin = types.SimpleNamespace(buffer=types.SimpleNamespace(raw=io.BytesIO(b'{"steamId":"1","username":"Test","sessionTicketBase64":"eA=="}\n')))
        with patch.object(worker, 'parse_args', return_value=args), patch.object(worker.sys, 'stdin', stdin), \
                patch.object(worker.sys, 'stdout', output), patch.object(worker, 'control_reader', side_effect=lambda a,b,s: control.update(state=s)), \
                patch.object(worker.native, 'verify_dll'), patch.object(worker.native, 'load_api', return_value=api), \
                patch.object(worker.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(worker.time, 'sleep'):
            self.assertEqual(worker.main(), 0)
        final = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(final['actionTickPacketsSent'], 3)
        self.assertGreater(final['connectionKeepAliveSent'], 0)
        self.assertTrue(final['closed']); self.assertFalse(final['eacVerified'])
        self.assertEqual(api.close_calls, 1)
        if protected: self.assertIn('eac_required', final['stages'])


if __name__ == '__main__': unittest.main()
