"""Cleanup and reporting contracts for the bounded native SDK diagnostic."""
import ctypes
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("probe", Path(__file__).with_name("eac-session-probe.py"))
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)

SETTINGS = {"productid": "a" * 32, "sandboxid": "b" * 32, "deploymentid": "c" * 32}


class FakeSDK:
    def __init__(self, platform=1, client=2, begin=12000, tick_error=False, end_error=False):
        self.platform, self.client, self.begin = platform, client, begin
        self.tick_error, self.end_error = tick_error, end_error
        self.calls = []

    def EOS_Initialize(self, options):
        self.calls.append("initialize")
        return 0

    def EOS_Logging_SetLogLevel(self, *args):
        return 0

    def EOS_Logging_SetCallback(self, callback):
        self.callback = callback
        return 0

    def EOS_Platform_Create(self, pointer):
        options = ctypes.cast(pointer, ctypes.POINTER(probe.eos.PlatformOptions)).contents
        if options.clientCredentials.clientId or options.clientCredentials.clientSecret:
            raise AssertionError("invented_credentials")
        return self.platform

    def EOS_Platform_GetAntiCheatClientInterface(self, platform):
        return self.client

    def EOS_AntiCheatClient_BeginSession(self, client, pointer):
        self.calls.append("begin")
        self.local_user = ctypes.cast(pointer, ctypes.POINTER(probe.BeginSessionOptions)).contents.localUserId
        return self.begin

    def EOS_Platform_Tick(self, platform):
        if self.tick_error:
            raise RuntimeError("tick_failed")

    def EOS_AntiCheatClient_EndSession(self, *args):
        self.calls.append("end")
        if self.end_error:
            raise RuntimeError("end_failed")
        return 0

    def EOS_Platform_Release(self, platform):
        self.calls.append("release")

    def EOS_Shutdown(self):
        self.calls.append("shutdown")
        return 0


class ProbeTests(unittest.TestCase):
    def test_platform_failure_shuts_down_without_begin(self):
        api, result = FakeSDK(platform=None), {}
        probe.probe(api, SETTINGS, 1, result)
        self.assertEqual(api.calls, ["initialize", "shutdown"])
        self.assertEqual(result["status"], "platform_create_failed_with_bootstrap_settings")

    def test_missing_interface_is_never_passed_to_session_api(self):
        api, result = FakeSDK(client=None), {}
        probe.probe(api, SETTINGS, 1, result)
        self.assertEqual(api.calls, ["initialize", "release", "shutdown"])

    def test_rejected_begin_does_not_call_end_or_claim_verification(self):
        api, result = FakeSDK(), {"eacVerified": False}
        probe.probe(api, SETTINGS, 1, result)
        self.assertIsNone(api.local_user)
        self.assertEqual(result["beginSessionResult"]["code"], 12000)
        self.assertFalse(result["eacVerified"])
        self.assertEqual(api.calls, ["initialize", "begin", "release", "shutdown"])

    def test_session_and_platform_are_cleaned_after_tick_exception(self):
        api, result = FakeSDK(begin=0, tick_error=True), {"eacVerified": False}
        with self.assertRaises(RuntimeError):
            probe.probe(api, SETTINGS, 1, result)
        self.assertEqual(api.calls[-3:], ["end", "release", "shutdown"])
        self.assertFalse(result["eacVerified"])

    def test_end_exception_still_releases_platform_and_sdk(self):
        api = FakeSDK(begin=0, tick_error=True, end_error=True)
        with self.assertRaises(RuntimeError):
            probe.probe(api, SETTINGS, 1, {})
        self.assertEqual(api.calls[-2:], ["release", "shutdown"])

    def test_log_classification_retains_no_remote_text_or_values(self):
        text = "ClientCredentials ClientId must not be null; private_value"
        self.assertEqual(probe.classify_log(text), "invalid_or_missing_clientid")
        self.assertIsNone(probe.classify_log("unrecognized diagnostic private_value"))


if __name__ == "__main__":
    unittest.main()
