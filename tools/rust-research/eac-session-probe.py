"""Bounded SDK diagnostic using an installed EAC Settings.json.

This uses the real SDK APIs without modifying the bootstrapper or launching
another executable. Bootstrap settings do not contain EOS Connect credentials
or a logged-in ProductUserId. The optional BeginSession call therefore uses a
null LocalUserId, records that missing prerequisite, and cannot establish that
an account has a valid protected session. No identities are invented or read
from another process. Raw native logging is suppressed by eos-connect.py.
"""

import argparse
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import time


SPEC = importlib.util.spec_from_file_location(
    "rust_eos_connect", Path(__file__).with_name("eos-connect.py"))
eos = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(eos)


class BeginSessionOptions(ctypes.Structure):
    _fields_ = [("apiVersion", eos.I), ("localUserId", eos.P), ("mode", eos.I)]


class EndSessionOptions(ctypes.Structure):
    _fields_ = [("apiVersion", eos.I)]


class LogMessage(ctypes.Structure):
    _fields_ = [("category", eos.P), ("message", eos.P), ("level", eos.I)]


LOG_CALLBACK = ctypes.CFUNCTYPE(None, ctypes.POINTER(LogMessage))


EXTRA_RESULTS = {
    12000: "AntiCheatClientProtectionNotAvailable",
    12001: "AntiCheatInvalidMode",
    12002: "AntiCheatClientProductIdMismatch",
    12003: "AntiCheatClientSandboxIdMismatch",
}


def code_result(code):
    code = int(code)
    return {"code": code, "name": EXTRA_RESULTS.get(code, eos.result_name(code))}


def classify_log(message):
    """Return fixed categories only; never retain native log text."""
    normalized = re.sub(r"[^a-z0-9]", "", message.lower())
    invalid = any(word in normalized for word in ("null", "empty", "missing", "invalid", "required", "notset"))
    if invalid:
        for field in ("clientid", "clientsecret", "productid", "sandboxid", "deploymentid"):
            if field in normalized:
                return "invalid_or_missing_" + field
    if "protectionnotavailable" in normalized:
        return "client_protection_not_available"
    return None


def read_settings(path):
    if not path.is_absolute():
        raise eos.WorkerError("settings_path_must_be_absolute")
    raw = path.read_bytes()
    if not 1 <= len(raw) <= 32768:
        raise eos.WorkerError("invalid_settings_size")
    settings = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(settings, dict):
        raise eos.WorkerError("invalid_settings")
    for name in ("productid", "sandboxid", "deploymentid"):
        if not isinstance(settings.get(name), str) or not re.fullmatch("[a-fA-F0-9]{32}", settings[name]):
            raise eos.WorkerError("invalid_product_identifiers")
    return settings, hashlib.sha256(raw).hexdigest()


def bind_client(api):
    if (ctypes.sizeof(BeginSessionOptions) != 24
            or BeginSessionOptions.localUserId.offset != 8
            or BeginSessionOptions.mode.offset != 16
            or ctypes.sizeof(EndSessionOptions) != 4
            or ctypes.sizeof(LogMessage) != 24 or LogMessage.level.offset != 16):
        raise eos.WorkerError("unexpected_client_struct_layout")
    signatures = {
        "EOS_Platform_GetAntiCheatClientInterface": (eos.P, [eos.P]),
        "EOS_AntiCheatClient_BeginSession":
            (eos.I, [eos.P, ctypes.POINTER(BeginSessionOptions)]),
        "EOS_AntiCheatClient_EndSession":
            (eos.I, [eos.P, ctypes.POINTER(EndSessionOptions)]),
        "EOS_Logging_SetCallback": (eos.I, [LOG_CALLBACK]),
    }
    for name, (return_type, argument_types) in signatures.items():
        function = getattr(api, name)
        function.restype, function.argtypes = return_type, argument_types


def probe(api, settings, seconds, result):
    strings = eos.NativeStrings()
    platform = client = None
    initialized = session_started = False
    categories = set()

    @LOG_CALLBACK
    def on_log(pointer):
        try:
            if pointer and pointer.contents.message:
                category = classify_log(ctypes.string_at(pointer.contents.message).decode("utf-8", errors="replace"))
                if category:
                    categories.add(category)
        except Exception:
            pass

    try:
        options = eos.InitializeOptions()
        options.apiVersion = eos.API_VERSIONS["initialize"]
        options.productName = strings.string("RustStandaloneEacProbe")
        options.productVersion = strings.string("1.0")
        code = int(api.EOS_Initialize(ctypes.byref(options)))
        result["initializeResult"] = code_result(code)
        if code != 0:
            result["status"] = "initialize_failed"
            return
        initialized = True
        result["initialized"] = True
        result["logCallbackResult"] = code_result(api.EOS_Logging_SetCallback(on_log))
        api.EOS_Logging_SetLogLevel(2147483647, 200)  # AllCategories / Error.
        options = eos.PlatformOptions()
        options.apiVersion = eos.API_VERSIONS["platform"]
        options.productId = strings.string(settings["productid"])
        options.sandboxId = strings.string(settings["sandboxid"])
        options.deploymentId = strings.string(settings["deploymentid"])
        options.isServer = 0
        options.flags = 2 | 4
        # Explicitly zero; Settings.json supplies no Connect credentials.
        # Never substitute a server credential or a fabricated client secret.
        options.clientCredentials = eos.ClientCredentials(None, None)
        platform = api.EOS_Platform_Create(ctypes.byref(options))
        result["platformCreated"] = bool(platform)
        if not platform:
            result["status"] = "platform_create_failed_with_bootstrap_settings"
            return
        client = api.EOS_Platform_GetAntiCheatClientInterface(platform)
        result["antiCheatClientInterfaceAvailable"] = bool(client)
        if not client:
            result["status"] = "anti_cheat_client_interface_unavailable"
            return
        # Negative diagnostic with an explicitly absent logged-in identity.
        # Its return value is not evidence of a complete authentication attempt.
        begin = BeginSessionOptions(3, None, 1)  # API3 / ClientServer.
        result["beginSessionAttempted"] = True
        code = int(api.EOS_AntiCheatClient_BeginSession(client, ctypes.byref(begin)))
        result["beginSessionResult"] = code_result(code)
        session_started = code == 0
        result["sdkSessionStarted"] = session_started
        result["status"] = ("sdk_session_started_without_account_verification" if session_started
                            else "begin_session_failed")
        if session_started:
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                api.EOS_Platform_Tick(platform)
                time.sleep(0.01)
    finally:
        # Attempt all cleanup stages even if an earlier native wrapper raises.
        try:
            if session_started:
                options = EndSessionOptions(1)
                result["endSessionResult"] = code_result(
                    api.EOS_AntiCheatClient_EndSession(client, ctypes.byref(options)))
        finally:
            try:
                if platform:
                    api.EOS_Platform_Release(platform)
                    result["platformReleased"] = True
            finally:
                try:
                    if initialized:
                        result["shutdownResult"] = code_result(api.EOS_Shutdown())
                finally:
                    strings.wipe()
                    result["nativeErrorCategories"] = sorted(categories)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", required=True, type=Path)
    parser.add_argument("--settings", required=True, type=Path)
    parser.add_argument("--seconds", type=int, default=2)
    args = parser.parse_args()
    report_fd = eos.quiet_output_fd()
    started = time.monotonic()
    result = {"status": "setup_pending", "initialized": False,
              "configurationSource": "installed_bootstrap_settings",
              "connectCredentialsProvided": False, "localUserIdPresent": False,
              "eosLoggedIn": False, "beginSessionAttempted": False,
              "sdkSessionStarted": False, "eacVerified": False,
              "serverValidated": False, "playerConnected": False,
              "bootstrapModified": False, "protectedProcessLaunched": False}
    try:
        if not 1 <= args.seconds <= 10:
            raise eos.WorkerError("invalid_deadline")
        settings, sha256 = read_settings(args.settings)
        result["settingsSha256"] = sha256
        eos.verify_abi()
        api = eos.load_sdk(args.dll)
        bind_client(api)
        result["sdkVersion"] = eos.SDK_VERSION
        result["sdkSha256"] = eos.SDK_SHA256
        probe(api, settings, args.seconds, result)
    except eos.WorkerError as error:
        result["status"] = str(error)
    except Exception:
        result["status"] = "setup_or_sdk_call_failed"
    finally:
        result["elapsedSeconds"] = round(time.monotonic() - started, 3)
        os.write(report_fd, json.dumps(result, separators=(",", ":")).encode("ascii") + b"\n")
        os.close(report_fd)
    # A successful diagnostic run is not a successfully authenticated session.
    return 0 if "initializeResult" in result and "shutdownResult" in result else 1


if __name__ == "__main__":
    raise SystemExit(main())
