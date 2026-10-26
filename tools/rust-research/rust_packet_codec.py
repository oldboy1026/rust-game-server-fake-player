"""Protocol 2635's level-1 packet obfuscation; no EAC protection/session API.

Static sources: Assembly-CSharp SHA256 71c50c6f0a48f67702cc2328e255e0000
803919599c6fea6705cc22c3aa94601, NetworkCryptographyServer handlers and
Craptography.XOR; Facepunch.Network SHA256 864ecda900aaa64f3908c4dc0fc012d68
57a5f9a8df3467130bbaa304fc9e833, BaseNetwork.Encrypt/Decrypt and Message.cctor.
The first application byte is clear. Only message indices 1..27 selected by
EncryptionPerType transform their remaining bytes, starting the XOR table at
protocol % 256 for EACH packet. Level > 1 uses EAC and is deliberately rejected.
"""

import base64

_TABLE = base64.b64decode(
    "l6CJW1oPgw3JX2A1wukH4YwkZx5FjghjJfAVChe+BpT3eOpLABrFPl7828t1IwsgObEhWO2VOFeuFH2Iq6hEr0qlR4aLMBumTZKe51Nv5Xo804Xm3GlcKTcu9Sj0Zo82QRk/oQHYUEnRTIS70FkSqcjEh4J0vJ9WpGRtxq26A0A02eL6fHsFyiaTdn7/UlXUz8474y8QOhG2vRwq37eq1Xf4mAIsmqNG3Zllm6crrAmBFif9E2Jsbk9x4OiyuXBo2vZh5Psi8sHu0pAMv7Oi8VEzkev5Du9rMcDWH7XHap24VMywc3kyLX8Elv6K7M1d3nJDHRhI842Aw05C1z2ctA=="
)
_PER_TYPE = bytes.fromhex("000000000001010101010101010101010100000101010001000000010100")


class PacketCodec:
    def __init__(self, protocol):
        if not isinstance(protocol, int) or isinstance(protocol, bool) or protocol != 2635:
            raise ValueError("unsupported_protocol")
        self._offset = protocol % len(_TABLE)
        self.level = 0

    def select(self, level):
        if type(level) is not int or level not in (0, 1):
            raise ValueError("protected_or_unsupported_encryption_required")
        self.level = level

    def transform(self, packet):
        if self.level == 0 or len(packet) <= 1:
            return packet
        index = packet[0] - 140
        if not 0 < index < 28 or not _PER_TYPE[index]:
            return packet
        output = bytearray(packet)
        for offset in range(1, len(output)):
            output[offset] ^= _TABLE[(self._offset + offset - 1) % len(_TABLE)]
        return output
