"""Offline chat protocol and lifecycle checks; no network or game DLL."""
import io
import copy
import json
import queue
import struct
import threading
import unittest
import types
from pathlib import Path
from unittest.mock import patch
from rust_chat import ChatSender, encode_chat
from test_rust_peer import worker, FakeApi, INITIAL_RESULT
from test_rust_player_tick import entity


class ChatTests(unittest.TestCase):
    def test_worker_sends_chat_after_own_finish_loading_and_returns_safe_ack(self):
        worker.RESULT = copy.deepcopy(INITIAL_RESULT)
        worker.PROGRESS = None
        clock, control, output = [0.0], {}, io.StringIO()
        finish = b"\x95" + struct.pack("<QI", 9, worker.FINISH_LOADING_RPC_ID)
        api = FakeApi([b"\x10", b"\x9d", b"\x8f", entity(), finish, b"\x15"], clock)
        receive = api.NET_Receive.function
        def receive_with_chat(peer):
            found = receive(peer)
            if found and api.current.raw == finish:
                control["state"]["chatQueue"].put_nowait({"id": 1, "text": "private chat"})
            return found
        api.NET_Receive.function = receive_with_chat
        args = types.SimpleNamespace(dll=Path("synthetic"), sha256="unused", host="127.0.0.1", port=1,
                                     seconds=1, persistent=True, stream=True, respawn_on_dead=False,
                                     wake_on_connect=False, no_ready=False, validate_input=False)
        identity = io.BytesIO(b'{"steamId":"1","username":"Synthetic","sessionTicketBase64":"eA=="}\n')
        stdin = types.SimpleNamespace(buffer=types.SimpleNamespace(raw=identity))
        def reader(stream, stop, state):
            control["state"] = state
        with patch.object(worker, "parse_args", return_value=args), patch.object(worker.sys, "stdin", stdin), \
                patch.object(worker.sys, "stdout", output), patch.object(worker, "control_reader", side_effect=reader), \
                patch.object(worker.native, "verify_dll"), patch.object(worker.native, "load_api", return_value=api), \
                patch.object(worker.time, "monotonic", side_effect=lambda: clock[0]), patch.object(worker.time, "sleep"):
            self.assertEqual(worker.main(), 0)
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertNotIn("private chat", output.getvalue())
        self.assertEqual([p[0] for p in api.payloads], [0x9e, 0x90, 0x98])
        self.assertEqual(api.payloads[-1], encode_chat("private chat"))
        self.assertEqual(messages[-1]["lastChat"], {"id": 1, "status": "sent"})
        self.assertEqual(messages[-1]["chatMessagesSent"], 1)
        self.assertEqual(messages[-1]["sentPackets"], 3)
        self.assertTrue(messages[-1]["closed"])
        self.assertEqual(api.close_calls, 1)

    def test_utf8_is_one_fixed_console_command_argument(self):
        payload = encode_chat("连接测试 hello 😀")
        self.assertEqual(payload[0], 0x98)
        self.assertEqual(struct.unpack_from("<I", payload, 1)[0], len(payload) - 5)
        self.assertEqual(payload[5:].decode("utf-8"), 'chat.say "连接测试 hello 😀"')
        self.assertEqual(len(encode_chat("😀" * 128)), 528)

    def test_console_separators_controls_and_invalid_unicode_never_send(self):
        for text in [None, "", "  ", "x" * 129, "a\nb", "a\rb", 'a";quit', "a\\b", "a;b", "a\0b", "\ud800", "a\u2028b"]:
            with self.subTest(text=repr(text)):
                with self.assertRaises(ValueError):
                    encode_chat(text)

    def test_not_ready_rate_limit_and_failed_native_send_are_distinct(self):
        sender, calls = ChatSender(), []
        send = lambda payload: calls.append(payload) or True
        self.assertEqual(sender.submit({"id": 1, "text": "hello"}, ready=False, send=send, now=0)["lastChat"]["status"], "not_ready")
        self.assertEqual(calls, [])
        self.assertEqual(sender.submit({"id": 2, "text": "hello"}, ready=True, send=send, now=0)["lastChat"]["status"], "sent")
        self.assertEqual(sender.submit({"id": 3, "text": "hello"}, ready=True, send=send, now=4.99)["lastChat"]["status"], "rate_limited")
        self.assertEqual(len(calls), 1)
        result = sender.submit({"id": 4, "text": "private message"}, ready=True, send=lambda payload: False, now=5)
        self.assertEqual(result["lastChat"]["status"], "send_failed")
        self.assertEqual(result["chatMessagesSent"], 1)
        self.assertNotIn("private message", json.dumps(result))

    def test_control_reader_queues_chat_then_handles_stop_without_native_calls(self):
        state, stop = {"chatQueue": queue.Queue(maxsize=1)}, threading.Event()
        stream = io.BytesIO(b'{"chat":{"id":1,"text":"hello"}}\n{"stop":true}\n')
        worker.control_reader(stream, stop, state)
        self.assertEqual(state["chatQueue"].get_nowait(), {"id": 1, "text": "hello"})
        self.assertTrue(stop.is_set())
        self.assertEqual(state["reason"], "stop_requested")
        for command in [{"command": "quit"}, {"chat": {"id": True, "text": "hello"}}, {"chat": {"id": 1, "text": '";quit'}}]:
            state, stop = {"chatQueue": queue.Queue(maxsize=1)}, threading.Event()
            worker.control_reader(io.BytesIO((json.dumps(command) + "\n").encode()), stop, state)
            self.assertEqual(state["reason"], "invalid_control_command")
            self.assertTrue(state["chatQueue"].empty())


if __name__ == "__main__":
    unittest.main()
