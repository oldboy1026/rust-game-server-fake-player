"""Bounded EOS Connect login through the inspected, installed Windows SDK.

Default/--inspect mode checks the SDK version and ctypes layouts only. It
does not initialize EOS, read a ticket, or make a login request.

Explicit --login reads one bounded JSON object from an anonymous stdin pipe:
  {"config": {"productName": ..., "productVersion": ..., "productId": ...,
              "sandboxId": ..., "deploymentId": ..., "clientId": ...,
              "clientSecret": ...}, "encryptedAppTicketBase64": ...}
All config values must come from the intended product's authorized client
configuration. There are no fallback product IDs or server credentials.

The entire encrypted app ticket is hex encoded for SteamAppTicket (type 1).
No old player token, PUID, or JWT is read. A successful login is metadata only;
this helper neither creates/links an EOS account nor starts an EAC session.
If a later transport needs PUID/JWT, add an explicit private downstream pipe;
never put them in this worker's ordinary stdout or command line.

ABI evidence: original Steam manifest firstpass assembly, SHA256
0082b49ab07d8a21c740348baeb902e7173b966e53d9b21dd56928556307ba77,
Epic.OnlineServices.*Internal sequential field declarations and interface
constants, reproduced in local work/eos-connect/managed-abi.txt. Corresponding
official references: EOS_InitializeOptions, EOS_Platform_Options,
EOS_Connect_Credentials, EOS_Connect_LoginOptions, and EOS_Connect_Login.
The installed SDK's EOS_GetVersion reports 1.19.1.2-55908005. Only its pinned
hash/version and Windows x64 ABI are supported here.
"""

import argparse
import base64
import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys
import time


SDK_SHA256 = "12ee3053ad76fc9a455534b627ca7a0f9923db3c05f54085a7daa3aff00d0b7e"
SDK_VERSION = "1.19.1.2-55908005"
MAX_INPUT_BYTES = 32768
API_VERSIONS = {"initialize": 4, "platform": 14, "credentials": 1,
                "login": 2, "copyIdToken": 1}
RESULTS = {
    0: "Success", 1: "NoConnection", 2: "InvalidCredentials", 3: "InvalidUser",
    4: "InvalidAuth", 5: "AccessDenied", 6: "MissingPermissions",
    8: "TooManyRequests", 9: "AlreadyPending", 10: "InvalidParameters",
    11: "InvalidRequest", 12: "UnrecognizedResponse", 13: "IncompatibleVersion",
    14: "NotConfigured", 15: "AlreadyConfigured", 16: "NotImplemented",
    17: "Canceled", 18: "NotFound", 19: "OperationWillRetry",
    21: "VersionMismatch", 22: "LimitExceeded", 23: "Disabled",
    26: "InvalidSandboxId", 27: "TimedOut", 29: "MissingRole",
    30: "MissingFeature", 31: "InvalidSandbox", 32: "InvalidDeployment",
    33: "InvalidProduct", 34: "InvalidProductUserID", 35: "ServiceFailure",
    38: "InvalidState", 39: "RequestInProgress", 40: "ApplicationSuspended",
    41: "NetworkDisconnected", 7000: "ConnectExternalTokenValidationFailed",
    7001: "ConnectUserAlreadyExists", 7002: "ConnectAuthExpired",
    7003: "ConnectInvalidToken", 7004: "ConnectUnsupportedTokenType",
    7005: "ConnectLinkAccountFailed", 7006: "ConnectExternalServiceUnavailable",
    7007: "ConnectExternalServiceConfigurationFailure",
}

P = ctypes.c_void_p
I = ctypes.c_int32
U = ctypes.c_uint32


class InitializeOptions(ctypes.Structure):
    _fields_ = [("apiVersion", I), ("allocateMemory", P), ("reallocateMemory", P),
                ("releaseMemory", P), ("productName", P), ("productVersion", P),
                ("reserved", P), ("systemInitializeOptions", P),
                ("overrideThreadAffinity", P)]


class ClientCredentials(ctypes.Structure):
    _fields_ = [("clientId", P), ("clientSecret", P)]


class PlatformOptions(ctypes.Structure):
    _fields_ = [("apiVersion", I), ("reserved", P), ("productId", P),
                ("sandboxId", P), ("clientCredentials", ClientCredentials),
                ("isServer", I), ("encryptionKey", P), ("overrideCountryCode", P),
                ("overrideLocaleCode", P), ("deploymentId", P),
                ("flags", ctypes.c_uint64), ("cacheDirectory", P),
                ("tickBudgetInMilliseconds", U), ("rtcOptions", P),
                ("integratedPlatformOptions", P), ("systemSpecificOptions", P),
                ("taskNetworkTimeoutSeconds", P)]


class ConnectCredentials(ctypes.Structure):
    _fields_ = [("apiVersion", I), ("token", P), ("type", I)]


class LoginOptions(ctypes.Structure):
    _fields_ = [("apiVersion", I), ("credentials", P), ("userLoginInfo", P)]


class LoginCallbackInfo(ctypes.Structure):
    _fields_ = [("resultCode", I), ("clientData", P), ("localUserId", P),
                ("continuanceToken", P)]


class CopyIdTokenOptions(ctypes.Structure):
    _fields_ = [("apiVersion", I), ("localUserId", P)]


class IdToken(ctypes.Structure):
    _fields_ = [("apiVersion", I), ("productUserId", P), ("jsonWebToken", P)]


LOGIN_CALLBACK = ctypes.CFUNCTYPE(None, ctypes.POINTER(LoginCallbackInfo))
STRUCT_SIZES = {InitializeOptions: 72, ClientCredentials: 16, PlatformOptions: 144,
                ConnectCredentials: 24, LoginOptions: 24, LoginCallbackInfo: 32,
                CopyIdTokenOptions: 16, IdToken: 24}


class WorkerError(Exception):
    """Only fixed error codes are ever included in a public result."""


class NativeStrings:
    def __init__(self):
        self.buffers = []

    def string(self, value):
        encoded = value.encode("utf-8")
        buffer = ctypes.create_string_buffer(encoded)
        self.buffers.append(buffer)
        return ctypes.addressof(buffer)

    def ticket_hex(self, ticket):
        # Build the C UTF-8 hex buffer directly, without a second immutable
        # Python hex string containing the complete bearer credential.
        buffer = ctypes.create_string_buffer(len(ticket) * 2 + 1)
        digits = b"0123456789ABCDEF"
        for index, byte in enumerate(ticket):
            buffer[index * 2] = digits[byte >> 4: (byte >> 4) + 1]
            buffer[index * 2 + 1] = digits[byte & 15: (byte & 15) + 1]
        self.buffers.append(buffer)
        return ctypes.addressof(buffer)

    def wipe(self):
        for buffer in self.buffers:
            ctypes.memset(ctypes.addressof(buffer), 0, ctypes.sizeof(buffer))
        self.buffers.clear()


def result_name(code):
    return RESULTS.get(code, "OtherResult")


def quiet_output_fd():
    """Keep one report-only FD; suppress both CRT and Win32 native logging."""
    report_fd = os.dup(sys.stdout.fileno())
    null_fd = os.open(os.devnull, os.O_WRONLY)
    os.dup2(null_fd, sys.stdout.fileno())
    os.dup2(null_fd, sys.stderr.fileno())
    if sys.platform == "win32":
        import msvcrt
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.SetStdHandle.argtypes = [U, P]
        kernel.SetStdHandle.restype = I
        kernel.SetStdHandle(U(-11).value, P(msvcrt.get_osfhandle(sys.stdout.fileno())))
        kernel.SetStdHandle(U(-12).value, P(msvcrt.get_osfhandle(sys.stderr.fileno())))
    os.close(null_fd)
    return report_fd


def verify_abi():
    if sys.platform != "win32" or struct.calcsize("P") != 8:
        raise WorkerError("requires_windows_x64")
    if any(ctypes.sizeof(kind) != size for kind, size in STRUCT_SIZES.items()):
        raise WorkerError("unexpected_struct_layout")
    offsets = {InitializeOptions: {"productName": 32, "overrideThreadAffinity": 64},
               PlatformOptions: {"clientCredentials": 32, "isServer": 48,
                                 "flags": 88, "taskNetworkTimeoutSeconds": 136},
               ConnectCredentials: {"token": 8, "type": 16},
               LoginOptions: {"credentials": 8, "userLoginInfo": 16},
               LoginCallbackInfo: {"localUserId": 16, "continuanceToken": 24}}
    for kind, fields in offsets.items():
        if any(getattr(kind, name).offset != offset for name, offset in fields.items()):
            raise WorkerError("unexpected_struct_layout")


def load_sdk(path):
    if not path.is_absolute():
        raise WorkerError("sdk_path_must_be_absolute")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SDK_SHA256:
        raise WorkerError("sdk_hash_mismatch")
    if data[:2] != b"MZ" or len(data) < 64:
        raise WorkerError("sdk_not_pe")
    pe = struct.unpack_from("<I", data, 60)[0]
    if pe + 26 > len(data) or data[pe:pe + 4] != b"PE\0\0" or struct.unpack_from("<H", data, pe + 4)[0] != 0x8664:
        raise WorkerError("sdk_not_windows_x64")
    api = ctypes.WinDLL(str(path.resolve()), winmode=0x1100)
    definitions = {
        "EOS_GetVersion": (ctypes.c_char_p, []),
        "EOS_Initialize": (I, [ctypes.POINTER(InitializeOptions)]),
        "EOS_Shutdown": (I, []),
        "EOS_Logging_SetLogLevel": (I, [I, I]),
        "EOS_Platform_Create": (P, [ctypes.POINTER(PlatformOptions)]),
        "EOS_Platform_Release": (None, [P]),
        "EOS_Platform_Tick": (None, [P]),
        "EOS_Platform_GetConnectInterface": (P, [P]),
        "EOS_Connect_Login": (None, [P, ctypes.POINTER(LoginOptions), P, LOGIN_CALLBACK]),
        "EOS_ProductUserId_IsValid": (I, [P]),
        "EOS_Connect_CopyIdToken": (I, [P, ctypes.POINTER(CopyIdTokenOptions), ctypes.POINTER(P)]),
        "EOS_Connect_IdToken_Release": (None, [P]),
    }
    for name, (return_type, arguments) in definitions.items():
        function = getattr(api, name)
        function.restype, function.argtypes = return_type, arguments
    if api.EOS_GetVersion() != SDK_VERSION.encode("ascii"):
        raise WorkerError("sdk_version_mismatch")
    return api


def read_private_input():
    if sys.stdin.isatty():
        raise WorkerError("private_stdin_pipe_required")
    raw = bytearray(sys.stdin.buffer.read(MAX_INPUT_BYTES + 1))
    ticket = bytearray()
    try:
        if not raw or len(raw) > MAX_INPUT_BYTES:
            raise WorkerError("invalid_private_input_size")
        body = json.loads(raw)
        if not isinstance(body, dict) or set(body) != {"config", "encryptedAppTicketBase64"}:
            raise WorkerError("invalid_private_input_fields")
        config = body["config"]
        fields = {"productName", "productVersion", "productId", "sandboxId", "deploymentId", "clientId", "clientSecret"}
        if not isinstance(config, dict) or set(config) != fields:
            raise WorkerError("incomplete_client_configuration")
        for name in fields:
            value = config[name]
            if not isinstance(value, str) or not value or "\0" in value or len(value.encode("utf-8")) > 64:
                raise WorkerError("invalid_client_configuration")
        text = body["encryptedAppTicketBase64"]
        if not isinstance(text, str) or not text or len(text) > 16384:
            raise WorkerError("invalid_encrypted_ticket")
        ticket.extend(base64.b64decode(text, validate=True))
        if not 32 <= len(ticket) <= 8192:
            raise WorkerError("invalid_encrypted_ticket_size")
        del body["encryptedAppTicketBase64"]
        return config, ticket
    finally:
        raw[:] = b"\0" * len(raw)


def login(api, config, ticket, seconds, result):
    strings = NativeStrings()
    platform = None
    id_token = P()
    initialized = False
    callback_state = {}
    # Callback objects and their argument buffers remain strongly referenced
    # until platform release has finished, including the timeout path.
    @LOGIN_CALLBACK
    def on_login(pointer):
        if pointer:
            info = pointer.contents
            callback_state["result"] = int(info.resultCode)
            callback_state["user"] = info.localUserId if info.resultCode == 0 else None

    try:
        initialize = InitializeOptions()
        initialize.apiVersion = API_VERSIONS["initialize"]
        initialize.productName = strings.string(config["productName"])
        initialize.productVersion = strings.string(config["productVersion"])
        code = api.EOS_Initialize(ctypes.byref(initialize))
        result["initializeResult"] = result_name(code)
        if code != 0:
            return
        initialized = True
        result["initialized"] = True
        api.EOS_Logging_SetLogLevel(2147483647, 0)  # AllCategories / Off.

        options = PlatformOptions()
        options.apiVersion = API_VERSIONS["platform"]
        options.productId = strings.string(config["productId"])
        options.sandboxId = strings.string(config["sandboxId"])
        options.deploymentId = strings.string(config["deploymentId"])
        options.clientCredentials = ClientCredentials(strings.string(config["clientId"]), strings.string(config["clientSecret"]))
        options.isServer = 0
        options.flags = 2 | 4  # DisableOverlay / DisableSocialOverlay.
        platform = api.EOS_Platform_Create(ctypes.byref(options))
        result["platformCreated"] = bool(platform)
        if not platform:
            result["status"] = "platform_create_failed"
            return
        connect = api.EOS_Platform_GetConnectInterface(platform)
        if not connect:
            result["status"] = "connect_interface_unavailable"
            return
        credentials = ConnectCredentials(API_VERSIONS["credentials"], strings.ticket_hex(ticket), 1)
        login_options = LoginOptions(API_VERSIONS["login"], ctypes.addressof(credentials), None)
        api.EOS_Connect_Login(connect, ctypes.byref(login_options), None, on_login)
        deadline = time.monotonic() + seconds
        while "result" not in callback_state and time.monotonic() < deadline:
            api.EOS_Platform_Tick(platform)
            time.sleep(0.01)
        result["loginCallbackReceived"] = "result" in callback_state
        if "result" not in callback_state:
            result["status"] = "connect_login_timeout"
            return
        result["connectResult"] = result_name(callback_state["result"])
        result["accountActionRequired"] = callback_state["result"] == 3
        if callback_state["result"] != 0:
            result["status"] = "connect_login_rejected"
            return
        user = callback_state["user"]
        if not user or not api.EOS_ProductUserId_IsValid(user):
            result["status"] = "connect_login_invalid_user_handle"
            return
        result["eosLoggedIn"] = True
        copy = CopyIdTokenOptions(API_VERSIONS["copyIdToken"], user)
        code = api.EOS_Connect_CopyIdToken(connect, ctypes.byref(copy), ctypes.byref(id_token))
        result["copyIdTokenResult"] = result_name(code)
        # Inspect presence only, never copy the SDK-owned JWT or PUID into an
        # ordinary Python string or any public output.
        if code == 0 and id_token:
            token = ctypes.cast(id_token, ctypes.POINTER(IdToken)).contents
            result["idTokenAvailable"] = bool(token.jsonWebToken)
        result["status"] = "connect_login_succeeded"
    finally:
        if id_token:
            api.EOS_Connect_IdToken_Release(id_token)
        if platform:
            api.EOS_Platform_Release(platform)
            result["platformReleased"] = True
        if initialized:
            result["shutdownResult"] = result_name(api.EOS_Shutdown())
        strings.wipe()
        ticket[:] = b"\0" * len(ticket)
        callback_state.clear()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", required=True, type=Path)
    parser.add_argument("--login", action="store_true", help="Read private stdin and explicitly request EOS Connect login")
    parser.add_argument("--seconds", type=int, default=30)
    args = parser.parse_args()
    report_fd = quiet_output_fd()
    started = time.monotonic()
    result = {"mode": "connect_login" if args.login else "sdk_inspection",
              "status": "setup_pending", "initialized": False,
              "eosLoggedIn": False, "idTokenAvailable": False,
              "eacVerified": False, "playerConnected": False}
    ticket = bytearray()
    try:
        if not 1 <= args.seconds <= 60:
            raise WorkerError("invalid_deadline")
        verify_abi()
        api = load_sdk(args.dll)
        result.update({"sdkVersion": SDK_VERSION, "abi": "windows-x64", "apiVersions": API_VERSIONS,
                       "structSizes": {kind.__name__: size for kind, size in STRUCT_SIZES.items()}})
        if args.login:
            config, ticket = read_private_input()
            login(api, config, ticket, args.seconds, result)
            config.clear()
        else:
            result["status"] = "sdk_inspection_succeeded"
    except WorkerError as error:
        result["status"] = str(error)  # All WorkerError messages are fixed codes.
    except Exception:
        result["status"] = "setup_or_sdk_call_failed"
    finally:
        ticket[:] = b"\0" * len(ticket)
        result["elapsedSeconds"] = round(time.monotonic() - started, 3)
        output = json.dumps(result, separators=(",", ":"), ensure_ascii=True).encode("ascii") + b"\n"
        os.write(report_fd, output)
        os.close(report_fd)
    return 0 if result["status"] in {"sdk_inspection_succeeded", "connect_login_succeeded"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
