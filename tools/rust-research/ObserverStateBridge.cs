using System;
using System.Globalization;
using System.IO;
using System.Text;

namespace Oxide.Plugins
{
    // Fixed-schema reader for the independent ObserverStateBridge plugin. No arbitrary path,
    // config read, reflection, assembly execution, writer or network operation.
    internal static class ObserverStateBridgeSchema
    {
        private const int MaximumBytes = 4096;
        private const long MaximumCounter = 1000000000L;

        internal sealed class Counts
        {
            public long calls, accepted, rejected, skippedOriginal;
        }
        internal sealed class State
        {
            public string version, startedUtc, observedUtc, status, focusStatus;
            public int windowSeconds, focusIdCount;
            public bool patchInstalled, unloaded;
            public Counts total, research, other, unclassified;
            public long writeErrors;
        }

        internal static object ReadFixedState()
        {
            try
            {
                string directory = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "HarmonyMods"));
                string file = Path.Combine(directory, "ReportingObserverFocused-state.json");
                FileAttributes directoryAttributes = File.GetAttributes(directory);
                FileAttributes fileAttributes = File.GetAttributes(file);
                if ((directoryAttributes & FileAttributes.Directory) == 0
                    || (directoryAttributes & FileAttributes.ReparsePoint) != 0
                    || (fileAttributes & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0)
                    return Failure("observer_state_not_regular");

                byte[] bytes = new byte[MaximumBytes + 1];
                int length = 0;
                using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    while (length < bytes.Length)
                    {
                        int read = stream.Read(bytes, length, bytes.Length - length);
                        if (read == 0) break;
                        length += read;
                    }
                }
                if (length > MaximumBytes) return Failure("observer_state_oversized");
                string text = new UTF8Encoding(false, true).GetString(bytes, 0, length);
                State state = new Parser(text).Read();
                DateTime observed = ParseUtc(state.observedUtc);
                DateTime retrieved = DateTime.UtcNow;
                double age = Math.Floor((retrieved - observed).TotalSeconds);
                return new
                {
                    readerVersion = "0.1.0", status = "observer_state_available",
                    retrievedUtc = retrieved.ToString("O"), snapshotAgeSeconds = age,
                    observedWithin15Seconds = age >= 0 && age <= 15,
                    snapshot = state
                };
            }
            catch (FileNotFoundException) { return Failure("observer_state_missing"); }
            catch (DirectoryNotFoundException) { return Failure("observer_state_missing"); }
            catch (DecoderFallbackException) { return Failure("observer_state_invalid_schema"); }
            catch (FormatException) { return Failure("observer_state_invalid_schema"); }
            catch (Exception) { return Failure("observer_state_read_failed"); }
        }

        private static object Failure(string category)
        { return new { readerVersion = "0.1.0", status = category }; }

        private static DateTime ParseUtc(string value)
        {
            DateTime parsed;
            if (!DateTime.TryParseExact(value, "yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out parsed))
                throw new FormatException();
            return parsed;
        }

        // Deliberately accepts the writer's fixed 0.1.0 order/schema only. It is
        // not a general JSON parser and never forwards input text or unknown data.
        private sealed class Parser
        {
            private readonly string _text;
            private int _position;
            internal Parser(string text) { _text = text; }
            internal State Read()
            {
                if (_text.Length > 0 && _text[0] == '\ufeff') _position++;
                var result = new State();
                Expect('{'); Key("version"); Literal("\"0.1.0\""); result.version = "0.1.0";
                Next("windowSeconds"); if (Unsigned(180) != 180) throw new FormatException(); result.windowSeconds = 180;
                Next("startedUtc"); result.startedUtc = Utc();
                Next("observedUtc"); result.observedUtc = Utc();
                Next("status"); result.status = Choice(new[] {"not_loaded", "unsupported_module_or_signature",
                    "existing_patches_refused", "observing", "observation_window_elapsed", "patch_failed_cleanup_pending",
                    "patch_failed", "unloaded", "unpatch_failed"});
                Next("focusStatus"); result.focusStatus = Choice(new[] {"not_read", "missing_unclassified",
                    "invalid_unclassified", "empty_unclassified", "read_failed_unclassified", "ready"});
                Next("focusIdCount"); result.focusIdCount = (int)Unsigned(20);
                if ((result.focusStatus == "ready") != (result.focusIdCount > 0)) throw new FormatException();
                Next("patchInstalled"); result.patchInstalled = Boolean();
                Next("unloaded"); result.unloaded = Boolean();
                Next("total"); result.total = Group();
                Next("research"); result.research = Group();
                Next("other"); result.other = Group();
                Next("unclassified"); result.unclassified = Group();
                Next("writeErrors"); result.writeErrors = Unsigned(MaximumCounter);
                Expect('}'); Space(); if (_position != _text.Length) throw new FormatException();
                if (result.total.calls != result.research.calls + result.other.calls + result.unclassified.calls
                    || result.total.accepted != result.research.accepted + result.other.accepted + result.unclassified.accepted
                    || result.total.rejected != result.research.rejected + result.other.rejected + result.unclassified.rejected
                    || result.total.skippedOriginal != result.research.skippedOriginal + result.other.skippedOriginal + result.unclassified.skippedOriginal)
                    throw new FormatException();
                if (result.focusStatus != "ready" && (result.research.calls != 0 || result.research.skippedOriginal != 0
                    || result.other.calls != 0 || result.other.skippedOriginal != 0)) throw new FormatException();
                return result;
            }
            private Counts Group()
            {
                var value = new Counts();
                Expect('{'); Key("calls"); value.calls = Unsigned(MaximumCounter);
                Next("accepted"); value.accepted = Unsigned(MaximumCounter);
                Next("rejected"); value.rejected = Unsigned(MaximumCounter);
                Next("skippedOriginal"); value.skippedOriginal = Unsigned(MaximumCounter);
                Expect('}');
                if (value.calls != value.accepted + value.rejected) throw new FormatException();
                return value;
            }
            private void Space()
            {
                while (_position < _text.Length && (_text[_position] == ' ' || _text[_position] == '\t'
                    || _text[_position] == '\r' || _text[_position] == '\n')) _position++;
            }
            private void Expect(char value)
            { Space(); if (_position >= _text.Length || _text[_position++] != value) throw new FormatException(); }
            private void Literal(string value)
            {
                Space(); if (_text.Length - _position < value.Length
                    || string.CompareOrdinal(_text, _position, value, 0, value.Length) != 0) throw new FormatException();
                _position += value.Length;
            }
            private void Key(string value) { Literal("\"" + value + "\""); Expect(':'); }
            private void Next(string value) { Expect(','); Key(value); }
            private bool Boolean()
            {
                Space(); if (_position < _text.Length && _text[_position] == 't') { Literal("true"); return true; }
                Literal("false"); return false;
            }
            private long Unsigned(long maximum)
            {
                Space(); int start = _position; long value = 0;
                while (_position < _text.Length && _text[_position] >= '0' && _text[_position] <= '9')
                {
                    if (_position - start >= 10) throw new FormatException();
                    value = value * 10 + (_text[_position++] - '0');
                    if (value > maximum) throw new FormatException();
                }
                if (_position == start || (_position - start > 1 && _text[start] == '0')) throw new FormatException();
                return value;
            }
            private string Utc()
            {
                Space(); Expect('"');
                int start = _position;
                if (_text.Length - start < 29) throw new FormatException();
                string value = _text.Substring(start, 28); _position += 28;
                if (_position >= _text.Length || _text[_position++] != '"') throw new FormatException();
                return ParseUtc(value).ToString("O");
            }
            private string Choice(string[] choices)
            {
                Space();
                foreach (string value in choices)
                {
                    string literal = "\"" + value + "\"";
                    if (_text.Length - _position >= literal.Length
                        && string.CompareOrdinal(_text, _position, literal, 0, literal.Length) == 0)
                    { _position += literal.Length; return value; }
                }
                throw new FormatException();
            }
        }
    }
}

namespace Oxide.Plugins
{
    [Info("ObserverStateBridge", "Local Research", "0.1.0")]
    [Description("Read-only fixed-schema bridge for the focused reporting observer state.")]
    public sealed class ObserverStateBridge : RustPlugin
    {
        private long _observerReadNextTimestamp;

        [ConsoleCommand("observerstatebridge.snapshot")]
        private void ObserverState(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!arg.IsRcon) { arg.ReplyWith(new { error = "rcon_required" }); return; }
            if (arg.Args != null && arg.Args.Length != 0)
            { arg.ReplyWith(new { error = "unexpected_arguments" }); return; }
            long now = System.Diagnostics.Stopwatch.GetTimestamp();
            long previous = System.Threading.Interlocked.Read(ref _observerReadNextTimestamp);
            if (now < previous || System.Threading.Interlocked.CompareExchange(ref _observerReadNextTimestamp,
                now + System.Diagnostics.Stopwatch.Frequency, previous) != previous)
            { arg.ReplyWith(new { error = "rate_limited" }); return; }
            arg.ReplyWith(ObserverStateBridgeSchema.ReadFixedState());
        }
    }
}
