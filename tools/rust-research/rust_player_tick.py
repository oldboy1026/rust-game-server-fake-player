"""Bounded ordinary own-player wake input. No EAC or movement simulation.

The caller supplies authenticated full Entity packets, a monotonic clock and a
sender on one approved, unencrypted peer. Private transforms never leave here.
Only three complete delta-overwriting ticks are sent, 50 ms apart: neutral,
DUCK, neutral. No attacks, console wake command, replay or periodic idle input.
"""
import math
import struct

INTERVAL = 0.05
MAX_STATE_AGE = 2.0
CONFIRM_SECONDS = 5.0
ZERO = (0.0, 0.0, 0.0)
MODEL_VECTORS = {10, 13, 15, 16, 21, 22}
MODEL_FLOATS = {4, 20}
MODEL_FIELDS = {4, *range(10, 23)}
WAKE_STATES = frozenset({
    "disabled", "waiting_state", "waiting_finish_loading", "unsupported_state",
    "unsequenced_state", "stale_state", "sending", "awaiting_confirmation",
    "already_awake", "awake_observed", "unconfirmed", "interrupted", "send_failed",
})


def _selected(data, schema, fields, *, reject_unknown=False):
    selected = {}
    for number, wire, value in fields(data):
        if number not in schema:
            if reject_unknown:
                raise ValueError()
            continue
        if number in selected or wire != schema[number]:
            raise ValueError()
        selected[number] = value
    return selected


def _float(data):
    value = struct.unpack("<f", data)[0]
    if not math.isfinite(value):
        raise ValueError()
    return value


def _vector(data, fields):
    selected = _selected(data, {1: 5, 2: 5, 3: 5}, fields, reject_unknown=True)
    # Full Entity/vector protobufs omit zero scalars; they are not deltas.
    return tuple(_float(selected[i]) if i in selected else 0.0 for i in (1, 2, 3))


def _state(packet, observed, fields, now):
    entity = _selected(memoryview(packet)[5:], {2: 2, 3: 2, 10: 2}, fields)
    base = _selected(entity[2], {1: 2, 2: 2, 4: 5}, fields)
    player = _selected(entity[3], {6: 2, 8: 0, 22: 0}, fields)
    parent = _selected(entity.get(10, b""), {1: 0, 2: 0}, fields)
    if player.get(22, 0) or any(parent.values()) or 6 not in player or 4 not in base:
        raise ValueError()
    server_time = _float(base[4])
    if server_time < 0:
        raise ValueError()
    position = _vector(base.get(1, b""), fields)
    angles = _vector(base.get(2, b""), fields)
    model = _selected(player[6], {i: 2 if i in MODEL_VECTORS else
                                  5 if i in MODEL_FLOATS else 0 for i in MODEL_FIELDS},
                      fields, reject_unknown=True)
    values = {}
    for number in sorted(MODEL_FIELDS):
        value = model.get(number)
        if number in MODEL_VECTORS:
            value = _vector(value if value is not None else b"", fields)
        elif number in MODEL_FLOATS:
            value = _float(value) if value is not None else 0.0
        else:
            value = 0 if value is None else value
            if value >= 2**31 or (number == 18 and value not in (0, 1)):
                raise ValueError()
        values[number] = value
    # Restrict to grounded, stationary, unmounted standing/crouching players.
    # Missing model flags decode to zero, not the constructor's OnGround=4.
    if (not values[11] & 4 or values[11] & ~(1 | 4 | 8 | 1024)
            or values[4] != 0 or values[13] != ZERO
            or values[14] != 0 or values[18] or not 0 <= values[20] <= 1):
        raise ValueError()
    flags = observed["flags"]
    if (observed["lifeState"] != "alive" or observed["healthPositive"] is not True
            or flags & (8 | 32 | 64 | 33554432) or not flags & 256):
        raise ValueError()
    # A local unparented neutral body has upright rotation and no body lean.
    # Aim Euler angles are independent of that body transform. This is not a
    # reconstruction of a mounted, crawling, leaning or camera-driven client.
    eye = (position[0], position[1] + 1.5 - 0.6 * values[20], position[2])
    values[11] &= ~8  # Client is awake; server still owns its Sleeping flag.
    return {"uid": observed["uid"], "position": position, "angles": angles,
            "model": values, "eye": eye, "received": now, "time": server_time}


def _varint(value):
    result = bytearray()
    while value > 127:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return result


def _scalar(number, value):
    return _varint(number << 3) + _varint(value)


def _message(number, value):
    return _varint((number << 3) | 2) + _varint(len(value)) + value


def _vec(value):
    # Explicit zeros overwrite a potentially nonzero previous ProtoDelta tick.
    return b"".join(bytes([(i << 3) | 5]) + struct.pack("<f", component)
                    for i, component in enumerate(value, 1))


def encode_tick(state, buttons):
    model = bytearray()
    for number, value in sorted(state["model"].items()):
        if number in MODEL_VECTORS:
            model += _message(number, _vec(value))
        elif number in MODEL_FLOATS:
            model += _varint((number << 3) | 5) + struct.pack("<f", value)
        else:
            model += _scalar(number, value)
    input_state = (_scalar(1, buttons) + _message(2, _vec(state["angles"]))
                   + _message(3, _vec(ZERO)))
    # Holster for the wake cycle: no weapon/item use on the already-awake race.
    return bytearray(b"\x9b" + _message(1, input_state)
                     + _message(2, _vec(state["position"])) + _message(4, model)
                     + _scalar(5, 0) + _message(6, _vec(state["eye"]))
                     + _scalar(7, 0) + _scalar(8, 50))


class WakeController:
    """One bounded attempt per connection. Public output is fixed metadata only."""
    def __init__(self, enabled, fields):
        self.enabled, self._fields = enabled, fields
        self._uid = self._seq = self._finish = self._private = None
        self._phase = 0
        self._next = self._pressed_at = self._completed_at = None
        self._press_seq = None
        self._press_uid = None
        self._events = []
        self._close_reason = None
        self._terminal = False
        self._sleeping = None
        self._server_time = None
        self.metadata = {"tickWakeEnabled": enabled, "tickPacketsSent": 0,
                         "wakeAttempted": False, "wakePressSent": False,
                         "wakeReleaseSent": False, "wakeAwakeObserved": False,
                         "wakeState": "waiting_state" if enabled else "disabled"}

    def _status(self, status):
        self.metadata["wakeState"] = status

    def invalidate(self):
        self._private = None
        if self._phase in (1, 2) and not self._terminal:
            self._terminal = True
            self._status("interrupted")
            self._events.append("wake_interrupted")
            if self._phase == 2:
                # Closing the peer is required if a safe release cannot be sent.
                self._close_reason = "wake_release_unavailable"

    def observe(self, packet, observed, now):
        """Reject reordered own snapshots; the seq belongs to the connection."""
        if not self.enabled:
            return True
        seq = struct.unpack_from("<I", packet, 1)[0]
        if seq == 0xffffffff:
            self.invalidate()
            if not self.metadata["wakeAttempted"]:
                self._status("unsequenced_state")
            return True  # Diagnostic state only; never authorizes a tick.
        if self._seq is not None and not 0 < (seq - self._seq) % 2**32 < 2**31:
            return False
        self._seq = seq
        if self._uid is not None and observed["uid"] != self._uid:
            self.invalidate()
            self._finish = None
            if self.metadata["wakeAttempted"]:
                self._terminal = True
                self._status("interrupted")
        self._uid = observed["uid"]
        try:
            state = _state(packet, observed, self._fields, now)
            if self._server_time is not None and state["time"] < self._server_time:
                raise ValueError()
            if self._phase in (1, 2) and self._private is not None:
                if state["position"] != self._private["position"]:
                    raise ValueError()
            self._server_time = state["time"]
            self._private = state
            self._sleeping = bool(observed["flags"] & 16)
        except (ValueError, KeyError, struct.error):
            self.invalidate()
            if not self.metadata["wakeAttempted"]:
                self._status("unsupported_state")
            return True
        if (self.metadata["wakePressSent"] and not self.metadata["wakeAwakeObserved"]
                and not self._sleeping and observed["uid"] == self._press_uid
                and self._press_seq is not None
                and 0 < (seq - self._press_seq) % 2**32 < 2**31
                and self._pressed_at <= now <= self._pressed_at + CONFIRM_SECONDS):
            self.metadata["wakeAwakeObserved"] = True
            self._events.append("wake_awake_observed")
            if self.metadata["wakeReleaseSent"]:
                self._status("awake_observed")
                self._terminal = True
        return True

    def finish_loading(self, uid):
        self._finish = uid

    def step(self, now, sender):
        if not self.enabled or self._terminal:
            return self._close_reason
        if self._phase == 3:
            if now - self._completed_at >= CONFIRM_SECONDS:
                self._status("unconfirmed")
                self._terminal = True
                self._events.append("wake_unconfirmed")
            return None
        state = self._private
        if state is None:
            return None
        if not 0 <= now - state["received"] <= MAX_STATE_AGE:
            self.invalidate()
            if not self.metadata["wakeAttempted"]:
                self._status("stale_state")
            return self._close_reason
        if self._finish != state["uid"]:
            self._status("waiting_finish_loading")
            return None
        if self._phase == 0 and not self._sleeping:
            self._status("already_awake")
            self._terminal = True
            return None
        if self._next is not None and now < self._next:
            return None
        # Do not replay a delayed press/release after a stalled worker.
        if self._next is not None and now - self._next > 0.25:
            self.invalidate()
            return self._close_reason
        buttons = 64 if self._phase == 1 else 0  # BUTTON.DUCK, no attack.
        payload = encode_tick(state, buttons)
        self.metadata["wakeAttempted"] = True
        try:
            sent = sender(payload)
        finally:
            payload[:] = b"\0" * len(payload)
        if not sent:
            self._status("send_failed")
            self._terminal = True
            self._events.append("tick_native_send_failed")
            self._close_reason = "tick_native_send_failed"
            return self._close_reason
        self.metadata["tickPacketsSent"] += 1
        self._phase += 1
        self._next = now + INTERVAL
        self._status("sending")
        if self._phase == 1:
            self._events.append("wake_neutral_sent")
        elif self._phase == 2:
            self._pressed_at, self._press_seq = now, self._seq
            self._press_uid = self._uid
            self.metadata["wakePressSent"] = True
            self._events.append("wake_press_sent")
        elif self._phase == 3:
            self._completed_at = now
            self.metadata["wakeReleaseSent"] = True
            self._events.append("wake_release_sent")
            confirmed = self.metadata["wakeAwakeObserved"]
            self._status("awake_observed" if confirmed else "awaiting_confirmation")
            self._terminal = confirmed
        return None

    def take_events(self):
        events, self._events = self._events, []
        return events

    def shutdown(self):
        self.invalidate()
        if self._phase == 3 and not self._terminal:
            self._status("unconfirmed")
            self._events.append("wake_unconfirmed")
        self._terminal = True
