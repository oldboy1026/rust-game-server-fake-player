using System;
using System.Globalization;
using System.Threading;

namespace Oxide.Plugins
{
    [Info("PlayerCountProbe", "Local Research", "0.1.0")]
    [Description("Read-only player-count lifecycle comparison; no population or authentication changes.")]
    public sealed class PlayerCountProbe : RustPlugin
    {
        private sealed class Counts
        {
            public long validations, ok, nonOk, inputHookCalls, lastInputHookUtcTicks;
            public string lastValidationUtc;
        }

        private sealed class Window
        {
            public readonly ulong[] focus;
            public readonly string startedUtc = DateTime.UtcNow.ToString("O");
            public readonly Counts focused = new Counts(), other = new Counts(), unclassified = new Counts();
            public Window(ulong[] ids) { focus = ids; }
            public Counts Group(ulong id)
            {
                if (focus.Length == 0) return unclassified;
                foreach (ulong value in focus) if (value == id) return focused;
                return other;
            }
        }

        private sealed class State
        {
            public int active, alive, dead, sleeping, connected, receivingSnapshot;
            public int rawTickRatePositive;
            public int networkEntries, networkConnected, networkAuthenticated;
            public int eacMapped, eacStatusAuthenticated;
        }

        private Window _window = new Window(new ulong[0]);
        private Oxide.Plugins.Timer _timer;
        private bool _subscribed;
        private int _stopping;
        private long _steamConnected, _steamDisconnected, _sampleErrors;
        private object _lastSample;

        private void OnServerInitialized()
        {
            if (_subscribed) return;
            Volatile.Write(ref _stopping, 0);
            Steamworks.SteamServer.OnValidateAuthTicketResponse += OnValidation;
            Steamworks.SteamServer.OnSteamServersConnected += OnSteamConnected;
            Steamworks.SteamServer.OnSteamServersDisconnected += OnSteamDisconnected;
            _subscribed = true;
            Sample();
            _timer = timer.Every(5f, Sample);
        }

        private void Unload()
        {
            Volatile.Write(ref _stopping, 1);
            if (_subscribed)
            {
                Steamworks.SteamServer.OnValidateAuthTicketResponse -= OnValidation;
                Steamworks.SteamServer.OnSteamServersConnected -= OnSteamConnected;
                Steamworks.SteamServer.OnSteamServersDisconnected -= OnSteamDisconnected;
                _subscribed = false;
            }
            if (_timer != null) { _timer.Destroy(); _timer = null; }
            // No focus identities or raw callback data are written to disk.
            Volatile.Write(ref _window, new Window(new ulong[0]));
            _lastSample = null;
        }

        private void OnValidation(Steamworks.SteamId user, Steamworks.SteamId unusedOwner,
            Steamworks.AuthResponse response)
        {
            if (Volatile.Read(ref _stopping) != 0) return;
            Window window = Volatile.Read(ref _window);
            Counts counts = window.Group((ulong)user);
            Interlocked.Increment(ref counts.validations);
            if (response == Steamworks.AuthResponse.OK) Interlocked.Increment(ref counts.ok);
            else Interlocked.Increment(ref counts.nonOk);
            Volatile.Write(ref counts.lastValidationUtc, DateTime.UtcNow.ToString("O"));
        }

        private void OnSteamConnected()
        {
            if (Volatile.Read(ref _stopping) == 0) Interlocked.Increment(ref _steamConnected);
        }

        private void OnSteamDisconnected(Steamworks.Result unusedResult)
        {
            if (Volatile.Read(ref _stopping) == 0) Interlocked.Increment(ref _steamDisconnected);
        }

        // Optional Oxide hook. Zero observations do not prove that no input was
        // sent: a framework/version may not dispatch this hook. Never override it.
        private void OnPlayerInput(BasePlayer player, InputState unusedInput)
        {
            if (Volatile.Read(ref _stopping) != 0 || player == null) return;
            Window window = Volatile.Read(ref _window);
            Counts counts = window.Group(player.userID);
            Interlocked.Increment(ref counts.inputHookCalls);
            Interlocked.Exchange(ref counts.lastInputHookUtcTicks, DateTime.UtcNow.Ticks);
        }

        private static State Group(Window window, ulong id, State focused, State other, State unclassified)
        {
            Counts counts = window.Group(id);
            return object.ReferenceEquals(counts, window.focused) ? focused
                : object.ReferenceEquals(counts, window.other) ? other : unclassified;
        }

        private static object WithCallbacks(State state, Counts counts)
        {
            long inputCalls = Interlocked.Read(ref counts.inputHookCalls);
            long inputUtcTicks = Interlocked.Read(ref counts.lastInputHookUtcTicks);
            return new
            {
                state.active, state.alive, state.dead, state.sleeping, state.connected, state.receivingSnapshot,
                state.rawTickRatePositive,
                state.networkEntries, state.networkConnected, state.networkAuthenticated,
                state.eacMapped, state.eacStatusAuthenticated,
                steamValidationCallbacks = Interlocked.Read(ref counts.validations),
                steamValidationOk = Interlocked.Read(ref counts.ok),
                steamValidationNonOk = Interlocked.Read(ref counts.nonOk),
                lastSteamValidationUtc = Volatile.Read(ref counts.lastValidationUtc),
                inputHookCalls = inputCalls,
                inputHookObserved = inputCalls != 0,
                lastInputHookUtc = inputUtcTicks == 0 ? null
                    : new DateTime(inputUtcTicks, DateTimeKind.Utc).ToString("O")
            };
        }

        // Called by the normal plugin main-thread timer or administrator command.
        // No callback touches game objects; no packet/input/position is retained.
        private void Sample()
        {
            if (Volatile.Read(ref _stopping) != 0) return;
            Window window = Volatile.Read(ref _window);
            try
            {
                var active = BasePlayer.activePlayerList;
                var server = Network.Net.sv;
                var connections = server == null ? null : server.connections;
                State focused = new State(), other = new State(), unclassified = new State();
                if (active != null)
                {
                    foreach (BasePlayer player in active)
                    {
                        if (player == null) continue;
                        State state = Group(window, player.userID, focused, other, unclassified);
                        state.active++;
                        if (player.IsDead()) state.dead++; else state.alive++;
                        if (player.IsSleeping()) state.sleeping++;
                        if (player.IsConnected) state.connected++;
                        if (player.IsReceivingSnapshot) state.receivingSnapshot++;
                        // The original getter is a periodically calculated raw
                        // tick rate, NOT a cumulative packet counter or admission.
                        if (player.rawTickCount > 0) state.rawTickRatePositive++;
                    }
                }
                if (connections != null)
                {
                    foreach (Network.Connection connection in connections)
                    {
                        if (connection == null) continue;
                        State state = Group(window, connection.userid, focused, other, unclassified);
                        state.networkEntries++;
                        if (connection.connected) state.networkConnected++;
                        if (connection.isAuthenticated) state.networkAuthenticated++;
                        if (EACServer.GetClient(connection) != IntPtr.Zero) state.eacMapped++;
                        if (EACServer.IsAuthenticated(connection)) state.eacStatusAuthenticated++;
                    }
                }
                bool steamValid = Steamworks.SteamServer.IsValid;
                _lastSample = new
                {
                    status = "sampled", utc = DateTime.UtcNow.ToString("O"),
                    windowStartedUtc = window.startedUtc, focusConfigured = window.focus.Length != 0,
                    focusAccountCount = window.focus.Length,
                    activeListAvailable = active != null, connectionListAvailable = connections != null,
                    effectiveSecure = server == null ? (bool?)null : server.secure,
                    effectiveEncryption = server == null ? (int?)null : server.encryption,
                    steamInterfaceValid = steamValid,
                    steamLoggedOn = steamValid ? (bool?)Steamworks.SteamServer.LoggedOn : null,
                    eacInterfaceAvailable = EACServer.ValidInterface,
                    focused = WithCallbacks(focused, window.focused),
                    other = WithCallbacks(other, window.other),
                    unclassified = WithCallbacks(unclassified, window.unclassified)
                };
            }
            catch (Exception)
            {
                Interlocked.Increment(ref _sampleErrors);
                // Do not return an older successful sample as a fresh observation.
                _lastSample = new { status = "sample_failed", utc = DateTime.UtcNow.ToString("O"),
                    windowStartedUtc = window.startedUtc };
            }
        }

        private static bool CanRead(ConsoleSystem.Arg arg)
        {
            return arg != null && (arg.IsRcon || arg.Connection == null || arg.Connection.authLevel >= 2);
        }

        [ConsoleCommand("playercountprobe.snapshot")]
        private void Snapshot(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!CanRead(arg)) { arg.ReplyWith(new { error = "forbidden" }); return; }
            Sample();
            arg.ReplyWith(new
            {
                version = "0.1.0", monitoring = _subscribed && Volatile.Read(ref _stopping) == 0,
                gameModuleMvid = typeof(BasePlayer).Assembly.ManifestModule.ModuleVersionId.ToString(),
                steamModuleMvid = typeof(Steamworks.SteamServer).Assembly.ManifestModule.ModuleVersionId.ToString(),
                networkModuleMvid = typeof(Network.Connection).Assembly.ManifestModule.ModuleVersionId.ToString(),
                steamConnectedCallbacks = Interlocked.Read(ref _steamConnected),
                steamDisconnectedCallbacks = Interlocked.Read(ref _steamDisconnected),
                sampleErrors = Interlocked.Read(ref _sampleErrors), sample = _lastSample
            });
        }

        [ConsoleCommand("playercountprobe.focus")]
        private void Focus(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!arg.IsRcon) { arg.ReplyWith(new { error = "rcon_required" }); return; }
            var args = arg.Args;
            if (args == null || args.Length == 0 || args.Length > 20)
            { arg.ReplyWith(new { error = "invalid_focus_arguments" }); return; }
            ulong[] ids;
            if (args.Length == 1 && args[0].ToString() == "clear") ids = new ulong[0];
            else
            {
                ids = new ulong[args.Length];
                for (int index = 0; index < args.Length; index++)
                {
                    string text = args[index].ToString();
                    bool valid = text != null && text.Length == 17;
                    if (valid) foreach (char ch in text) if (ch < '0' || ch > '9') valid = false;
                    ulong value;
                    if (!valid || !ulong.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out value))
                    { arg.ReplyWith(new { error = "invalid_focus_arguments" }); return; }
                    for (int earlier = 0; earlier < index; earlier++)
                        if (ids[earlier] == value)
                        { arg.ReplyWith(new { error = "duplicate_focus_arguments" }); return; }
                    ids[index] = value;
                }
            }
            // Immutable epoch: in-flight callbacks finish against their old window.
            Window next = new Window(ids);
            Volatile.Write(ref _window, next);
            _lastSample = null;
            Sample();
            arg.ReplyWith(new { status = "focus_set", focusAccountCount = ids.Length,
                windowStartedUtc = next.startedUtc });
        }
    }
}
