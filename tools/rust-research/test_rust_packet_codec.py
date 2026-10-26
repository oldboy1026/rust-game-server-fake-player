"""Offline protocol-2635 level-1 conformance and protection boundaries."""
import hashlib
import unittest
from rust_packet_codec import PacketCodec, _TABLE, _PER_TYPE


class PacketCodecTests(unittest.TestCase):
    def test_static_arrays_match_original_rva_field_hashes(self):
        self.assertEqual(len(_TABLE), 256)
        self.assertEqual(hashlib.sha256(_TABLE).hexdigest(), "3682c3d0020436c45462995a4f64438c144bbfeba725b00de5906ab322b6b915")
        self.assertEqual(hashlib.sha256(_PER_TYPE).hexdigest(), "89ba46b3662e51e173cf7317420e88c32553305fd1af395c8b0e6d91dab1f060")

    def test_vector_and_per_packet_reset_preserve_header_and_input(self):
        codec = PacketCodec(2635)
        original = bytearray.fromhex("95000102030405060708090a0b0c0d0e0f")
        self.assertIs(codec.transform(original), original)
        codec.select(1)
        # Protocol 2635 % 256 = 75; original table bytes at 75..90 are
        # e7536fe57a3cd385e6dc695c29372ef5, XORed with the 00..0f payload.
        expected = bytes.fromhex("95e7526de67e39d582eed56357253a20fa")
        self.assertEqual(codec.transform(original), expected)
        self.assertEqual(original.hex(), "95000102030405060708090a0b0c0d0e0f")
        self.assertEqual(codec.transform(original), expected)
        self.assertEqual(codec.transform(expected), original)
        long_packet = bytes([0x91]) + bytes(range(256)) * 2
        self.assertEqual(codec.transform(codec.transform(long_packet)), long_packet)

    def test_only_selected_application_payloads_transform(self):
        codec = PacketCodec(2635)
        codec.select(1)
        encrypted = {0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
                     0x99, 0x9a, 0x9b, 0x9c, 0x9f, 0xa0, 0xa1, 0xa3, 0xa7}
        for header in range(256):
            packet = bytes([header, 0, 1, 2, 3])
            self.assertEqual(codec.transform(packet) != packet, header in encrypted, hex(header))
        for packet in (b"", b"\x91", b"\x10", b"\xa2"):
            self.assertEqual(codec.transform(packet), packet)

    def test_protected_modes_and_unknown_protocols_fail_closed(self):
        codec = PacketCodec(2635)
        for level in (2, 3, 255, -1, True, "1", None):
            with self.assertRaises(ValueError):
                codec.select(level)
            self.assertEqual(codec.level, 0)
        for protocol in (True, 2634, 2636):
            with self.assertRaises(ValueError):
                PacketCodec(protocol)


if __name__ == "__main__":
    unittest.main()
