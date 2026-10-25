"""Ordinary global chat only; no arbitrary console-command interface."""
import struct


def encode_chat(text):
    if (not isinstance(text, str) or not text.strip() or len(text) > 128
            or any(ord(c) < 32 or 127 <= ord(c) <= 159 or c in '"\\;\u2028\u2029' for c in text)):
        raise ValueError("invalid_chat_text")
    encoded = text.encode("utf-8", errors="strict")
    if len(encoded) > 512:
        raise ValueError("invalid_chat_text")
    command = b'chat.say "' + encoded + b'"'
    return bytearray(b"\x98" + struct.pack("<I", len(command)) + command)


def validate_request(value):
    if (not isinstance(value, dict) or set(value) != {"id", "text"}
            or type(value["id"]) is not int or not 1 <= value["id"] <= 2147483647):
        raise ValueError("invalid_chat_request")
    encode_chat(value["text"])
    return value


class ChatSender:
    def __init__(self):
        self.next_send_at = 0
        self.metadata = {"chatMessagesSent": 0}

    def submit(self, request, *, ready, send, now):
        validate_request(request)
        status = "not_ready"
        if ready:
            if now < self.next_send_at:
                status = "rate_limited"
            else:
                self.next_send_at = now + 5
                status = "sent" if send(encode_chat(request["text"])) else "send_failed"
                if status == "sent":
                    self.metadata["chatMessagesSent"] += 1
        self.metadata["lastChat"] = {"id": request["id"], "status": status}
        return self.metadata
