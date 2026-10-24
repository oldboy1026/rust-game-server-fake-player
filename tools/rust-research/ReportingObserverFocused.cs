using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using HarmonyLib;

// Candidate only: no HarmonyPatch attributes, prefixes, finalizers or replay.
// The official loader's automatic PatchAll has no attributed targets here.
public sealed class ReportingObserverFocused : IHarmonyModHooks
{
    private const string Owner = "com.facepunch.rust_dedicated.ReportingObserverFocused";
    private const string ExpectedMvid = "8bccf266-54c7-4aeb-9b6e-328799059d1f";
    private const int WindowSeconds = 180;
    private const int MaximumFocusIds = 20;
    private const int MaximumConfigBytes = 4096;
    private static readonly object Gate = new object();
    // Never hold this gate while accessing disk, Harmony or game APIs.
    private static readonly object CountGate = new object();
    private sealed class Counts
    {
        internal long Calls, Accepted, Rejected, Skipped;
        internal void Reset() { Calls = Accepted = Rejected = Skipped = 0; }
    }
    private static readonly Counts Total = new Counts();
    private static readonly Counts Research = new Counts();
    private static readonly Counts Other = new Counts();
    private static readonly Counts Unclassified = new Counts();
    private static ulong[] _focusIds;
    private static int _focusIdCount;
    private static string _focusStatus = "not_read";
    private static long _writeErrors, _deadlineTimestamp;
    private static int _observing, _installed, _unloaded;
    private static string _path, _startedUtc, _status = "not_loaded";
    private Harmony _harmony;
    private Timer _timer;
    private MethodInfo _target;

    public void OnLoaded(OnHarmonyModLoadedArgs args)
    {
        lock (Gate)
        {
            if (_timer != null || Volatile.Read(ref _installed) != 0) return;
            Volatile.Write(ref _observing, 0);
            lock (CountGate)
            {
                Total.Reset(); Research.Reset(); Other.Reset(); Unclassified.Reset();
                ClearFocusIds();
                _focusIdCount = 0;
            }
            _writeErrors = 0;
            _unloaded = 0;
            _focusStatus = "not_read";
            _startedUtc = DateTime.UtcNow.ToString("O");
            _deadlineTimestamp = Stopwatch.GetTimestamp() + (long)WindowSeconds * Stopwatch.Frequency;
            string directory = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "HarmonyMods"));
            _path = Path.Combine(directory, "ReportingObserverFocused-state.json");
            try
            {
                ulong[] ids = ReadFocusConfig(Path.Combine(directory, "ReportingObserverFocused-private.json"));
                lock (CountGate)
                {
                    _focusIds = ids;
                    _focusIdCount = ids == null ? 0 : ids.Length;
                }
                _target = FindTarget();
                if (_target == null)
                { _status = "unsupported_module_or_signature"; ClearFocusIdsSafely(); WriteSnapshot(); return; }
                if (HasAnyPatches(_target))
                { _status = "existing_patches_refused"; ClearFocusIdsSafely(); WriteSnapshot(); return; }
                _harmony = new Harmony(Owner);
                _harmony.Patch(_target, postfix: new HarmonyMethod(typeof(ReportingObserverFocused), "ObserveResult"));
                var patches = Harmony.GetPatchInfo(_target);
                MethodInfo own = ObserverMethod();
                bool found = false;
                if (patches != null)
                    foreach (var patch in patches.Postfixes)
                        if (patch.owner == Owner && patch.PatchMethod == own) found = true;
                if (!found) throw new InvalidOperationException();
                Volatile.Write(ref _installed, 1);
                Volatile.Write(ref _observing, 1);
                _status = "observing";
                WriteSnapshot();
                _timer = new Timer(_ => { lock (Gate) {
                    if (Volatile.Read(ref _unloaded) != 0) return;
                    if (Stopwatch.GetTimestamp() >= Interlocked.Read(ref _deadlineTimestamp))
                    {
                        Volatile.Write(ref _observing, 0);
                        _status = "observation_window_elapsed";
                        ClearFocusIdsSafely();
                        try { if (_timer != null) _timer.Change(Timeout.Infinite, Timeout.Infinite); }
                        catch (ObjectDisposedException) { }
                    }
                    WriteSnapshot();
                } }, null, 1000, 1000);
            }
            catch (Exception)
            {
                Volatile.Write(ref _observing, 0);
                ClearFocusIdsSafely();
                bool remaining = true;
                try { RemoveOwnPatch(); remaining = HasOwnPatch(); } catch (Exception) { }
                Volatile.Write(ref _installed, remaining ? 1 : 0);
                _status = remaining ? "patch_failed_cleanup_pending" : "patch_failed";
                WriteSnapshot();
            }
        }
    }

    private static MethodInfo FindTarget()
    {
        foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (assembly.GetName().Name != "Facepunch.Steamworks.Win64"
                || assembly.ManifestModule.ModuleVersionId.ToString() != ExpectedMvid) continue;
            Type type = assembly.GetType("Steamworks.ISteamGameServer", false);
            Type steamId = assembly.GetType("Steamworks.SteamId", false);
            if (type == null || steamId != typeof(Steamworks.SteamId)) return null;
            FieldInfo value = steamId.GetField("Value", BindingFlags.Public | BindingFlags.Instance);
            if (value == null || value.FieldType != typeof(ulong)) return null;
            MethodInfo method = type.GetMethod("BUpdateUserData",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly,
                null, new Type[] { steamId, typeof(string), typeof(uint) }, null);
            if (method == null || method.IsStatic || method.IsGenericMethod || method.ReturnType != typeof(bool)
                || method.GetMethodBody() == null || (method.Attributes & MethodAttributes.PinvokeImpl) != 0)
                return null;
            return method;
        }
        return null;
    }

    private static bool HasAnyPatches(MethodBase target)
    {
        var patches = Harmony.GetPatchInfo(target);
        return patches != null && (patches.Prefixes.Count != 0 || patches.Postfixes.Count != 0
            || patches.Transpilers.Count != 0 || patches.Finalizers.Count != 0);
    }

    // By-value SteamId/result/runOriginal only. Never receives the name or score.
    // Identity is compared in memory, never converted to text or passed to output.
    private static void ObserveResult(Steamworks.SteamId __0, bool __result, bool __runOriginal)
    {
        if (Volatile.Read(ref _observing) == 0) return;
        lock (CountGate)
        {
            if (Volatile.Read(ref _observing) == 0) return;
            if (Stopwatch.GetTimestamp() >= Interlocked.Read(ref _deadlineTimestamp))
            { Volatile.Write(ref _observing, 0); ClearFocusIds(); return; }
            Counts category = Unclassified;
            ulong value = __0.Value;
            if (_focusIds != null && _focusIds.Length != 0 && value != 0)
            {
                category = Other;
                for (int i = 0; i < _focusIds.Length; i++)
                    if (_focusIds[i] == value) { category = Research; break; }
            }
            if (!__runOriginal)
            { Total.Skipped++; category.Skipped++; return; }
            Total.Calls++; category.Calls++;
            if (__result) { Total.Accepted++; category.Accepted++; }
            else { Total.Rejected++; category.Rejected++; }
        }
    }

    private static ulong[] ReadFocusConfig(string path)
    {
        try
        {
            byte[] buffer = new byte[MaximumConfigBytes + 1];
            int count = 0;
            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    while (count < buffer.Length)
                    {
                        int read = stream.Read(buffer, count, buffer.Length - count);
                        if (read == 0) break;
                        count += read;
                    }
                }
            }
            catch (FileNotFoundException) { _focusStatus = "missing_unclassified"; return null; }
            catch (DirectoryNotFoundException) { _focusStatus = "missing_unclassified"; return null; }
            if (count > MaximumConfigBytes) { _focusStatus = "invalid_unclassified"; return null; }
            string json = new UTF8Encoding(false, true).GetString(buffer, 0, count);
            Array.Clear(buffer, 0, buffer.Length);
            int position = 0;
            if (json.Length > 0 && json[0] == '\ufeff') position++;
            if (!Take(json, ref position, '{') || !TakeLiteral(json, ref position, "\"researchIds\"")
                || !Take(json, ref position, ':') || !Take(json, ref position, '['))
            { _focusStatus = "invalid_unclassified"; return null; }
            var ids = new List<ulong>();
            SkipWhitespace(json, ref position);
            if (position < json.Length && json[position] != ']')
            {
                while (true)
                {
                    SkipWhitespace(json, ref position);
                    if (position >= json.Length || json[position++] != '"')
                    { _focusStatus = "invalid_unclassified"; return null; }
                    ulong id = 0;
                    for (int i = 0; i < 17; i++)
                    {
                        if (position >= json.Length || json[position] < '0' || json[position] > '9')
                        { _focusStatus = "invalid_unclassified"; return null; }
                        id = id * 10 + (ulong)(json[position++] - '0');
                    }
                    if (position >= json.Length || json[position++] != '"' || ids.Contains(id)
                        || ids.Count >= MaximumFocusIds)
                    { _focusStatus = "invalid_unclassified"; return null; }
                    ids.Add(id);
                    SkipWhitespace(json, ref position);
                    if (position < json.Length && json[position] == ',') { position++; continue; }
                    break;
                }
            }
            if (!Take(json, ref position, ']') || !Take(json, ref position, '}'))
            { _focusStatus = "invalid_unclassified"; return null; }
            SkipWhitespace(json, ref position);
            if (position != json.Length) { _focusStatus = "invalid_unclassified"; return null; }
            _focusStatus = ids.Count == 0 ? "empty_unclassified" : "ready";
            return ids.Count == 0 ? null : ids.ToArray();
        }
        catch (DecoderFallbackException) { _focusStatus = "invalid_unclassified"; return null; }
        catch (Exception) { _focusStatus = "read_failed_unclassified"; return null; }
    }

    private static void SkipWhitespace(string text, ref int position)
    {
        while (position < text.Length && (text[position] == ' ' || text[position] == '\t'
            || text[position] == '\r' || text[position] == '\n')) position++;
    }
    private static bool Take(string text, ref int position, char expected)
    {
        SkipWhitespace(text, ref position);
        if (position >= text.Length || text[position] != expected) return false;
        position++; return true;
    }
    private static bool TakeLiteral(string text, ref int position, string expected)
    {
        SkipWhitespace(text, ref position);
        if (text.Length - position < expected.Length
            || string.CompareOrdinal(text, position, expected, 0, expected.Length) != 0) return false;
        position += expected.Length; return true;
    }

    private static void ClearFocusIds()
    {
        if (_focusIds != null) Array.Clear(_focusIds, 0, _focusIds.Length);
        _focusIds = null;
    }
    private static void ClearFocusIdsSafely() { lock (CountGate) { ClearFocusIds(); } }

    private static string CountsJson(Counts counts)
    {
        return "{\"calls\":" + Number(counts.Calls) + ",\"accepted\":" + Number(counts.Accepted)
            + ",\"rejected\":" + Number(counts.Rejected) + ",\"skippedOriginal\":" + Number(counts.Skipped) + "}";
    }
    private static void WriteSnapshot()
    {
        if (string.IsNullOrEmpty(_path)) return;
        try
        {
            string aggregates;
            lock (CountGate)
            {
                aggregates = ",\"total\":" + CountsJson(Total) + ",\"research\":" + CountsJson(Research)
                    + ",\"other\":" + CountsJson(Other) + ",\"unclassified\":" + CountsJson(Unclassified);
            }
            // Fixed states, timestamps and aggregate counts only. No exception text,
            // identity, argument names/values, config content, tickets or keys.
            string json = "{\"version\":\"0.1.0\",\"windowSeconds\":180,\"startedUtc\":\"" + _startedUtc
                + "\",\"observedUtc\":\"" + DateTime.UtcNow.ToString("O")
                + "\",\"status\":\"" + _status + "\",\"focusStatus\":\"" + _focusStatus
                + "\",\"focusIdCount\":" + Number(_focusIdCount)
                + ",\"patchInstalled\":" + (Volatile.Read(ref _installed) != 0 ? "true" : "false")
                + ",\"unloaded\":" + (Volatile.Read(ref _unloaded) != 0 ? "true" : "false")
                + aggregates + ",\"writeErrors\":" + Number(Interlocked.Read(ref _writeErrors)) + "}\n";
            string temporary = _path + ".tmp";
            File.WriteAllText(temporary, json);
            if (File.Exists(_path)) File.Replace(temporary, _path, null);
            else File.Move(temporary, _path);
        }
        catch (Exception) { Interlocked.Increment(ref _writeErrors); }
    }

    private static string Number(long value) { return value.ToString(CultureInfo.InvariantCulture); }
    private static MethodInfo ObserverMethod()
    { return typeof(ReportingObserverFocused).GetMethod("ObserveResult", BindingFlags.Static | BindingFlags.NonPublic); }
    private void RemoveOwnPatch()
    {
        if (_harmony != null && _target != null) _harmony.Unpatch(_target, ObserverMethod());
    }
    private bool HasOwnPatch()
    {
        var remaining = _target == null ? null : Harmony.GetPatchInfo(_target);
        if (remaining != null)
            foreach (var patch in remaining.Postfixes)
                if (patch.owner == Owner) return true;
        return false;
    }

    public void OnUnloaded(OnHarmonyModUnloadedArgs args)
    {
        Volatile.Write(ref _observing, 0);
        ClearFocusIdsSafely();
        Timer timer = Interlocked.Exchange(ref _timer, null);
        if (timer != null) timer.Dispose();
        bool removed = true;
        try { RemoveOwnPatch(); removed = !HasOwnPatch(); }
        catch (Exception) { removed = false; }
        if (removed) Volatile.Write(ref _installed, 0);
        _status = removed ? "unloaded" : "unpatch_failed";
        Volatile.Write(ref _unloaded, 1);
        // A slow disk never blocks the official unload command.
        ThreadPool.QueueUserWorkItem(_ => { lock (Gate) { WriteSnapshot(); } });
    }
}
