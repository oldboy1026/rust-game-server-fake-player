using System;
using System.Globalization;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using HarmonyLib;

// No HarmonyPatch attributes: the official loader's automatic PatchAll is empty.
// Only the validated method below receives a result-only postfix.
public sealed class ReportingObserver : IHarmonyModHooks
{
    private const string Owner = "com.facepunch.rust_dedicated.ReportingObserver";
    private const string ExpectedMvid = "8bccf266-54c7-4aeb-9b6e-328799059d1f";
    private static readonly object Gate = new object();
    private static long _calls, _accepted, _rejected, _skipped, _writeErrors;
    private static long _deadlineTimestamp;
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
            _calls = _accepted = _rejected = _skipped = _writeErrors = 0;
            _unloaded = 0;
            _startedUtc = DateTime.UtcNow.ToString("O");
            _deadlineTimestamp = Stopwatch.GetTimestamp() + 180L * Stopwatch.Frequency;
            _path = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath,
                "..", "HarmonyMods", "ReportingObserver-state.json"));
            try
            {
                _target = FindTarget();
                if (_target == null) { _status = "unsupported_module_or_signature"; WriteSnapshot(); return; }
                var before = Harmony.GetPatchInfo(_target);
                if (before != null && (before.Prefixes.Count != 0 || before.Postfixes.Count != 0
                    || before.Transpilers.Count != 0 || before.Finalizers.Count != 0))
                { _status = "existing_patches_refused"; WriteSnapshot(); return; }
                _harmony = new Harmony(Owner);
                _harmony.Patch(_target, postfix: new HarmonyMethod(typeof(ReportingObserver), "ObserveResult"));
                var patches = Harmony.GetPatchInfo(_target);
                bool found = false;
                if (patches != null)
                    foreach (var patch in patches.Postfixes)
                        if (patch.owner == Owner) found = true;
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
                        try { if (_timer != null) _timer.Change(Timeout.Infinite, Timeout.Infinite); }
                        catch (ObjectDisposedException) { }
                    }
                    WriteSnapshot();
                } }, null, 1000, 1000);
            }
            catch (Exception)
            {
                Volatile.Write(ref _observing, 0);
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
            if (type == null || steamId == null) return null;
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

    // __result is passed by value; no arguments, identity or payload are received.
    // No prefix/finalizer, skip-original flag, return rewrite or game API call.
    private static void ObserveResult(bool __result, bool __runOriginal)
    {
        if (Volatile.Read(ref _observing) == 0) return;
        if (Stopwatch.GetTimestamp() >= Interlocked.Read(ref _deadlineTimestamp))
        { Volatile.Write(ref _observing, 0); return; }
        if (!__runOriginal) { Interlocked.Increment(ref _skipped); return; }
        Interlocked.Increment(ref _calls);
        if (__result) Interlocked.Increment(ref _accepted);
        else Interlocked.Increment(ref _rejected);
    }

    private static void WriteSnapshot()
    {
        if (string.IsNullOrEmpty(_path)) return;
        try
        {
            // Fixed text and aggregate numbers only; no raw exception data.
            string json = "{\"version\":\"0.1.0\",\"windowSeconds\":180,\"startedUtc\":\"" + _startedUtc
                + "\",\"observedUtc\":\"" + DateTime.UtcNow.ToString("O")
                + "\",\"status\":\"" + _status
                + "\",\"patchInstalled\":" + (Volatile.Read(ref _installed) != 0 ? "true" : "false")
                + ",\"unloaded\":" + (Volatile.Read(ref _unloaded) != 0 ? "true" : "false")
                + ",\"calls\":" + Number(Interlocked.Read(ref _calls))
                + ",\"accepted\":" + Number(Interlocked.Read(ref _accepted))
                + ",\"rejected\":" + Number(Interlocked.Read(ref _rejected))
                + ",\"skippedOriginal\":" + Number(Interlocked.Read(ref _skipped))
                + ",\"writeErrors\":" + Number(Interlocked.Read(ref _writeErrors)) + "}\n";
            string temporary = _path + ".tmp";
            File.WriteAllText(temporary, json);
            if (File.Exists(_path)) File.Replace(temporary, _path, null);
            else File.Move(temporary, _path);
        }
        catch (Exception) { Interlocked.Increment(ref _writeErrors); }
    }

    private static string Number(long value) { return value.ToString(CultureInfo.InvariantCulture); }

    private void RemoveOwnPatch()
    {
        if (_harmony != null && _target != null)
            _harmony.Unpatch(_target, typeof(ReportingObserver).GetMethod("ObserveResult", BindingFlags.Static | BindingFlags.NonPublic));
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
        Timer timer = Interlocked.Exchange(ref _timer, null);
        if (timer != null) timer.Dispose();
        bool removed = true;
        try
        {
            RemoveOwnPatch();
            removed = !HasOwnPatch();
        }
        catch (Exception) { removed = false; }
        if (removed) Volatile.Write(ref _installed, 0);
        _status = removed ? "unloaded" : "unpatch_failed";
        Volatile.Write(ref _unloaded, 1);
        // A slow disk must never block the server's unload command. A pending
        // snapshot and this final snapshot serialize on the background gate.
        ThreadPool.QueueUserWorkItem(_ => { lock (Gate) { WriteSnapshot(); } });
    }
}
