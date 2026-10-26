"""Single-owner, bounded test actions. No terrain engine or EAC integration.

Movement requires an operator-confirmed clear, flat test area. The trajectories
are experimental, not a reconstruction of Rust's CharacterController. A send
receipt never proves server acceptance, landing, or public-count eligibility.
"""
import copy
import math
import struct

ACTIONS = frozenset({'wake', 'respawn', 'suicide', 'stop', 'forward', 'backward', 'left', 'right', 'jump'})
MOVEMENT = frozenset({'forward', 'backward', 'left', 'right', 'jump'})
STATUSES = frozenset({'started', 'sent', 'stopped', 'not_ready', 'stale_state',
                      'unsupported_state', 'busy', 'rate_limited', 'send_failed',
                      'interrupted', 'snapshot_observed', 'unconfirmed'})


def validate_request(value):
    if (not isinstance(value, dict) or not {'id', 'action', 'flatGround'} <= set(value)
            or set(value) - {'id', 'action', 'flatGround', 'confirmDeath'}
            or type(value['id']) is not int or not 1 <= value['id'] <= 2147483647
            or not isinstance(value['action'], str) or value['action'] not in ACTIONS or type(value['flatGround']) is not bool
            or 'confirmDeath' in value and type(value['confirmDeath']) is not bool
            or value['action'] == 'suicide' and value.get('confirmDeath') is not True
            or value['action'] in MOVEMENT and not value['flatGround']):
        raise ValueError()
    return dict(value)


class ActionController:
    def __init__(self, tick, fields):
        self.tick = tick
        self.tracker = tick.WakeController(True, fields)
        self.metadata = {'actionTickPacketsSent': 0}
        self._active = None
        self._confirmation = None
        self._next_action = 0
        self._close = None
        self._last_id = 0
        self._own = None
        self._own_at = None
        self._own_seq = None

    def _reply(self, request, status):
        self.metadata['lastAction'] = {'id': request['id'], 'action': request['action'], 'status': status}

    def observe(self, packet, observed, now):
        accepted = self.tracker.observe(packet, observed, now)
        if not accepted:
            return False
        seq = struct.unpack_from('<I', packet, 1)[0]
        if seq == 0xffffffff:
            self._own = self._own_at = self._own_seq = None
            self.interrupt()
            return True  # Never authorize actions using unsequenced diagnostics.
        if self._active:
            # A replacement, new full model, damage, or state transition requires
            # replanning against collision/state data we don't implement.
            state = self.tracker._private
            expected = self._active.get('last_position', self._active['state']['position'])
            if (observed['uid'] != self._active['state']['uid'] or state is None
                    or math.dist(state['position'], expected) >= 0.002):
                self.interrupt()
        confirmation = self._confirmation
        if (confirmation and observed['uid'] == confirmation['uid']
                and 0 < (seq - confirmation['seq']) % 2**32 < 2**31
                and 0 <= now - confirmation['at'] <= 5):
            action = confirmation['request']['action']
            state = self.tracker._private
            matched = (action == 'respawn' and observed['lifeState'] == 'alive'
                       or action == 'suicide' and observed['lifeState'] == 'dead'
                       or action == 'wake' and not observed['flags'] & 16
                       or action in MOVEMENT and state is not None
                       and math.dist(state['position'], confirmation['position']) < 0.05)
            if matched:
                self._reply(confirmation['request'], 'snapshot_observed')
                self._confirmation = None
        self._own, self._own_at, self._own_seq = observed, now, seq
        return True

    def finish_loading(self, uid):
        self.tracker.finish_loading(uid)

    def interrupt(self):
        if self._active:
            self._reply(self._active['request'], 'interrupted')
            # Close only this peer when a pressed input or airborne pose cannot
            # be released safely. Never keep transmitting a guessed correction.
            if self._active['index'] > 0:
                self._close = 'action_release_unavailable'
        self._active = None
        self._confirmation = None

    def invalidate(self, reason='state_changed'):
        self.interrupt()
        self.tracker.invalidate(reason)
        self._own = self._own_at = self._own_seq = None

    def receive_own_rpc(self, packet):
        if self._active and len(packet) >= 13 and struct.unpack_from('<I', packet, 9)[0] == self.tick.FORCE_VIEW_RPC:
            return False
        return self.tracker.receive_own_rpc(packet)

    def receive_position_echo(self, packet):
        if self._active:
            if len(packet) not in (37, 45):
                return False
            expected = self._active.get('last_position')
            if expected is not None:
                position = struct.unpack_from('<fff', packet, 9)
                angles = struct.unpack_from('<fff', packet, 21)
                parent = struct.unpack_from('<Q', packet, 37)[0] if len(packet) == 45 else 0
                if (not parent and all(math.isfinite(v) for v in (*position, *angles))
                        and math.dist(position, expected) < 0.002):
                    return True
            return False
        return self.tracker.receive_position_echo(packet)

    def receive_flags_echo(self, packet):
        return self.tracker.receive_flags_echo(packet)

    def submit(self, request, *, ready, auto_busy, now, sender):
        request = validate_request(request)
        if request['id'] <= self._last_id:
            self._reply(request, 'not_ready')
            return
        self._last_id = request['id']
        if request['action'] == 'stop':
            # Interrupting an in-flight movement closes this owned connection;
            # idle stop is a no-op and never disconnects other accounts.
            self.interrupt()
            self._reply(request, 'stopped')
            return
        if not ready or self._close:
            self._reply(request, 'not_ready')
            return
        if self._active or auto_busy:
            self._reply(request, 'busy')
            return
        if now < self._next_action:
            self._reply(request, 'rate_limited')
            return
        own = self._own
        if (own is None or self._own_at is None or not 0 <= now - self._own_at <= 2
                or own['uid'] != self.tracker._finish):
            self._reply(request, 'stale_state')
            return
        if request['action'] in {'respawn', 'suicide'}:
            expected = 'dead' if request['action'] == 'respawn' else 'alive'
            if (own['lifeState'] != expected or own['flags'] & (8 | 32 | 33554432)
                    or not own['flags'] & 256):
                self._reply(request, 'unsupported_state')
                return
            self._next_action = now + 5
            command = b'respawn' if request['action'] == 'respawn' else b'kill'
            payload = bytearray(b'\x98' + struct.pack('<I', len(command)) + command)
            try:
                sent = sender(payload)
            finally:
                payload[:] = b'\0' * len(payload)
            self._reply(request, 'sent' if sent else 'send_failed')
            if sent:
                self._confirmation = {'request': request, 'uid': own['uid'], 'seq': self._own_seq, 'at': now}
                self._own_at = None  # One command per fresh observation.
            return
        state = self.tracker._private
        if state is None or not 0 <= now - state['received'] <= 2:
            self._reply(request, 'unsupported_state')
            return
        if (request['action'] in MOVEMENT and (own['flags'] & 16 or state['model'][20] != 0
                                               or state['model'][11] & 1)):
            self._reply(request, 'unsupported_state')
            return
        if request['action'] == 'wake' and not own['flags'] & 16:
            self._reply(request, 'unsupported_state')
            return
        self._next_action = now + 5
        self._confirmation = None
        self._active = {'request': request, 'state': copy.deepcopy(state), 'index': 0,
                        'next': now, 'seq': self._own_seq}
        self._reply(request, 'started')

    def step(self, now, sender):
        if self._close:
            return self._close
        if self._confirmation and now - self._confirmation['at'] > 5:
            self._reply(self._confirmation['request'], 'unconfirmed')
            self._confirmation = None
        active = self._active
        if not active or now < active['next']:
            return None
        if now - active['next'] > 0.25 or now - active['state']['received'] > 2:
            self.interrupt()
            return self._close
        state = copy.deepcopy(active['state'])
        action, index = active['request']['action'], active['index']
        count = 3 if action == 'wake' else 16 if action == 'jump' else 6
        buttons = 0
        if action == 'wake':
            buttons = 64 if index == 1 else 0
        elif action == 'jump':
            # Experimental 0.7s up/down arc, max 1.5m, same flat landing point.
            # No terrain or server gravity can be inferred from the snapshot.
            phase = min(14, max(0, index - 1)) / 14
            height = 6 * phase * (1 - phase)
            state['position'] = (state['position'][0], state['position'][1] + height, state['position'][2])
            state['eye'] = (state['eye'][0], state['eye'][1] + height, state['eye'][2])
            if 1 <= index < 15:
                state['model'][11] = state['model'][11] & ~4 | 2
            buttons = 32 if index == 1 else 0
        else:
            # 4 steps at 1.4m/s, capped at 0.28m. Relative to own view yaw.
            direction, button = {'forward': (0, 2), 'backward': (180, 4),
                                 'left': (-90, 8), 'right': (90, 16)}[action]
            yaw = math.radians(state['angles'][1] + direction)
            distance = min(index, 4) * 0.07
            offset = (math.sin(yaw) * distance, 0, math.cos(yaw) * distance)
            state['position'] = tuple(a + b for a, b in zip(state['position'], offset))
            state['eye'] = tuple(a + b for a, b in zip(state['eye'], offset))
            buttons = button if 1 <= index <= 4 else 0
        payload = self.tick.encode_tick(state, buttons)
        try:
            sent = sender(payload)
        finally:
            payload[:] = b'\0' * len(payload)
        if not sent:
            self._reply(active['request'], 'send_failed')
            self._active = None
            self._close = 'action_native_send_failed'
            return self._close
        self.metadata['actionTickPacketsSent'] += 1
        active['last_position'] = state['position']
        active['index'] += 1
        active['next'] = now + self.tick.INTERVAL
        if active['index'] == count:
            self._reply(active['request'], 'sent')
            self._confirmation = {'request': active['request'], 'uid': state['uid'],
                                  'seq': active['seq'], 'at': now, 'position': state['position']}
            self._active = None
            # Do not authorize another action using locally predicted state.
            self.tracker.invalidate()
            self._own_at = None
        return None
