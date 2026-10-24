using System;
using System.Globalization;
using System.Threading;

namespace Oxide.Plugins
{
    [Info("ReportingDiagnostics", "Local Research", "0.1.0")]
    [Description("Observes aggregate Steam callbacks and cached cp samples without changing reporting.")]
    public sealed class ReportingDiagnostics : RustPlugin
    {
        private const float SampleSeconds = 5f;
        private Oxide.Plugins.Timer _sampleTimer;
        private bool _subscribed;
        private int _stopping;
        private string _startedUtc;
        private long _validationCallbacks;
        private long _validationOkCallbacks;
        private long _validationNonOkCallbacks;
        private long _steamConnectedCallbacks;
        private long _steamDisconnectedCallbacks;
        private string _lastValidationUtc;
        private string _lastSteamConnectedUtc;
        private string _lastSteamDisconnectedUtc;

        // Samples run on the plugin timer/main thread. Event callbacks only update
        // the atomic counters and timestamps above; no account data is retained.
        private long _samples;
        private long _validCpSamples;
        private long _missingCpSamples;
        private long _steamUnavailableSamples;
        private long _sampleErrors;
        private long _cpChanges;
        private string _lastSampleUtc;
        private string _lastCpChangeUtc;
        private bool _steamInterfaceValid;
        private bool? _steamLoggedOn;
        private int? _activeCount;
        private int? _cp;
        private int? _previousCp;

        private void OnServerInitialized()
        {
            if (_subscribed)
                return;

            Volatile.Write(ref _stopping, 0);
            _startedUtc = DateTime.UtcNow.ToString("O");
            Steamworks.SteamServer.OnValidateAuthTicketResponse += ObserveValidation;
            Steamworks.SteamServer.OnSteamServersConnected += ObserveSteamConnected;
            Steamworks.SteamServer.OnSteamServersDisconnected += ObserveSteamDisconnected;
            _subscribed = true;

            Sample();
            _sampleTimer = timer.Every(SampleSeconds, Sample);
        }

        private void Unload()
        {
            Volatile.Write(ref _stopping, 1);
            if (_subscribed)
            {
                Steamworks.SteamServer.OnValidateAuthTicketResponse -= ObserveValidation;
                Steamworks.SteamServer.OnSteamServersConnected -= ObserveSteamConnected;
                Steamworks.SteamServer.OnSteamServersDisconnected -= ObserveSteamDisconnected;
                _subscribed = false;
            }

            if (_sampleTimer != null)
            {
                _sampleTimer.Destroy();
                _sampleTimer = null;
            }
        }

        private void ObserveValidation(Steamworks.SteamId unusedUser, Steamworks.SteamId unusedOwner,
            Steamworks.AuthResponse response)
        {
            if (Volatile.Read(ref _stopping) != 0)
                return;

            // Ticket cancellations and later invalidations are also callbacks.
            // Non-OK is not an admission-failure count or a unique-player count.
            Interlocked.Increment(ref _validationCallbacks);
            if (response == Steamworks.AuthResponse.OK)
                Interlocked.Increment(ref _validationOkCallbacks);
            else
                Interlocked.Increment(ref _validationNonOkCallbacks);
            Volatile.Write(ref _lastValidationUtc, DateTime.UtcNow.ToString("O"));
        }

        private void ObserveSteamConnected()
        {
            if (Volatile.Read(ref _stopping) != 0)
                return;

            Interlocked.Increment(ref _steamConnectedCallbacks);
            Volatile.Write(ref _lastSteamConnectedUtc, DateTime.UtcNow.ToString("O"));
        }

        private void ObserveSteamDisconnected(Steamworks.Result unusedResult)
        {
            if (Volatile.Read(ref _stopping) != 0)
                return;

            Interlocked.Increment(ref _steamDisconnectedCallbacks);
            Volatile.Write(ref _lastSteamDisconnectedUtc, DateTime.UtcNow.ToString("O"));
        }

        private void Sample()
        {
            if (Volatile.Read(ref _stopping) != 0)
                return;

            _samples++;
            _lastSampleUtc = DateTime.UtcNow.ToString("O");
            _steamLoggedOn = null;
            _activeCount = null;
            _cp = null;

            try
            {
                var active = BasePlayer.activePlayerList;
                _activeCount = active == null ? (int?)null : active.Count;
                _steamInterfaceValid = Steamworks.SteamServer.IsValid;
                if (!_steamInterfaceValid)
                {
                    _steamUnavailableSamples++;
                    _previousCp = null;
                    return;
                }

                _steamLoggedOn = Steamworks.SteamServer.LoggedOn;
                // The inspected GameTags getter only reads its managed cache.
                // Never return or log the full tags; retain the numeric cp only.
                _cp = ReadCp(Steamworks.SteamServer.GameTags);
                if (!_cp.HasValue)
                {
                    _missingCpSamples++;
                    _previousCp = null;
                    return;
                }

                _validCpSamples++;
                if (_previousCp.HasValue && _previousCp.Value != _cp.Value)
                {
                    _cpChanges++;
                    _lastCpChangeUtc = _lastSampleUtc;
                }
                _previousCp = _cp;
            }
            catch (Exception)
            {
                // Do not log exception text: other libraries may include
                // endpoints or runtime data in it. A failure is an aggregate.
                _sampleErrors++;
                _steamInterfaceValid = false;
                _steamLoggedOn = null;
                _activeCount = null;
                _cp = null;
                _previousCp = null;
            }
        }

        private static int? ReadCp(string tags)
        {
            if (string.IsNullOrEmpty(tags))
                return null;

            int? result = null;
            bool seen = false;
            foreach (string raw in tags.Split(','))
            {
                string part = raw.Trim();
                if (!part.StartsWith("cp", StringComparison.Ordinal))
                    continue;

                if (seen)
                    return null;
                seen = true;

                int count;
                if (!int.TryParse(part.Substring(2), NumberStyles.None,
                    CultureInfo.InvariantCulture, out count))
                    return null;
                result = count;
            }
            return result;
        }

        [ConsoleCommand("reportdiag.snapshot")]
        private void SnapshotCommand(ConsoleSystem.Arg arg)
        {
            if (arg == null)
                return;

            var caller = arg.Connection;
            if (!arg.IsRcon && caller != null && caller.authLevel < 2)
            {
                arg.ReplyWith(new { error = "forbidden" });
                return;
            }

            // No argument starts an active experiment or invokes publication.
            // Event totals are independent atomic reads, not a transactional sum.
            arg.ReplyWith(new
            {
                version = "0.1.0",
                utc = DateTime.UtcNow.ToString("O"),
                monitoring = _subscribed && Volatile.Read(ref _stopping) == 0,
                startedUtc = _startedUtc,
                sampleIntervalSeconds = SampleSeconds,
                samples = _samples,
                lastSampleUtc = _lastSampleUtc,
                steamInterfaceValid = _steamInterfaceValid,
                steamLoggedOn = _steamLoggedOn,
                activeListEntries = _activeCount,
                cachedCp = _cp,
                cachedCpMatchesActive = _cp.HasValue && _activeCount.HasValue
                    ? (bool?)(_cp.Value == _activeCount.Value) : null,
                validCpSamples = _validCpSamples,
                missingCpSamples = _missingCpSamples,
                steamUnavailableSamples = _steamUnavailableSamples,
                sampleErrors = _sampleErrors,
                observedCpChanges = _cpChanges,
                lastObservedCpChangeUtc = _lastCpChangeUtc,
                steamValidationCallbacks = Interlocked.Read(ref _validationCallbacks),
                steamValidationOkCallbacks = Interlocked.Read(ref _validationOkCallbacks),
                steamValidationNonOkCallbacks = Interlocked.Read(ref _validationNonOkCallbacks),
                lastSteamValidationUtc = Volatile.Read(ref _lastValidationUtc),
                steamConnectedCallbacks = Interlocked.Read(ref _steamConnectedCallbacks),
                lastSteamConnectedUtc = Volatile.Read(ref _lastSteamConnectedUtc),
                steamDisconnectedCallbacks = Interlocked.Read(ref _steamDisconnectedCallbacks),
                lastSteamDisconnectedUtc = Volatile.Read(ref _lastSteamDisconnectedUtc)
            });
        }
    }
}
