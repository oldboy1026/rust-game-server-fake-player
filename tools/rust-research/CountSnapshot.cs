using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

// A single aggregate read on the official loader's main-thread callback.
// No Harmony patches, game events, timers, commands, network or identity output.
public sealed class CountSnapshot : IHarmonyModHooks
{
    private static readonly object Gate = new object();
    private string _path, _startedUtc, _snapshot;
    private int _unloaded, _writeErrors;

    public void OnLoaded(OnHarmonyModLoadedArgs args)
    {
        _startedUtc = DateTime.UtcNow.ToString("O");
        try
        {
            _path = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath,
                "..", "HarmonyMods", "CountSnapshot-state.json"));
            _snapshot = Supported() ? Capture() : "\"status\":\"unsupported_modules\"";
        }
        catch (Exception) { _snapshot = "\"status\":\"snapshot_failed\""; }
        QueueWrite();
    }

    private static bool Supported()
    {
        return typeof(BasePlayer).Assembly.ManifestModule.ModuleVersionId.ToString()
                == "ea5bea93-989c-4789-88b5-c1200be42811"
            && typeof(Network.Connection).Assembly.ManifestModule.ModuleVersionId.ToString()
                == "c7a69bdc-e8e7-47b6-a5a2-f9e0fec10480"
            && typeof(Steamworks.SteamServer).Assembly.ManifestModule.ModuleVersionId.ToString()
                == "8bccf266-54c7-4aeb-9b6e-328799059d1f";
    }

    private static string Capture()
    {
        var json = new StringBuilder("\"status\":\"captured\"");
        var active = BasePlayer.activePlayerList;
        var sleeping = BasePlayer.sleepingPlayerList;
        var server = Network.Net.sv;
        var connections = server == null ? null : server.connections;
        int activeAlive = 0, activeDead = 0, activeSleeping = 0;
        int activeConnected = 0, activeReceivingSnapshot = 0, activeValid = 0;
        if (active != null)
        {
            foreach (BasePlayer player in active)
            {
                // Unity's null comparison also excludes destroyed native objects.
                if (player == null) continue;
                activeValid++;
                if (player.IsDead()) activeDead++; else activeAlive++;
                if (player.IsSleeping()) activeSleeping++;
                if (player.IsConnected) activeConnected++;
                if (player.IsReceivingSnapshot) activeReceivingSnapshot++;
            }
        }
        Number(json, "activeListEntries", active == null ? (int?)null : active.Count);
        Number(json, "activeValid", active == null ? (int?)null : activeValid);
        Number(json, "activeAlive", active == null ? (int?)null : activeAlive);
        Number(json, "activeDead", active == null ? (int?)null : activeDead);
        Number(json, "activeSleeping", active == null ? (int?)null : activeSleeping);
        Number(json, "activeConnected", active == null ? (int?)null : activeConnected);
        Number(json, "activeReceivingSnapshot", active == null ? (int?)null : activeReceivingSnapshot);
        Number(json, "sleepingListEntries", sleeping == null ? (int?)null : sleeping.Count);
        int connected = 0, authenticated = 0, eacMapped = 0, eacStatusAuthenticated = 0;
        if (connections != null)
        {
            foreach (Network.Connection connection in connections)
            {
                if (connection == null) continue;
                if (connection.connected) connected++;
                if (connection.isAuthenticated) authenticated++;
                if (EACServer.GetClient(connection) != IntPtr.Zero) eacMapped++;
                if (EACServer.IsAuthenticated(connection)) eacStatusAuthenticated++;
            }
        }
        Number(json, "connectionListEntries", connections == null ? (int?)null : connections.Count);
        Number(json, "connectedConnections", connections == null ? (int?)null : connected);
        Number(json, "authenticatedConnections", connections == null ? (int?)null : authenticated);
        Number(json, "eacMappedConnections", connections == null ? (int?)null : eacMapped);
        Number(json, "eacStatusAuthenticatedConnections", connections == null ? (int?)null : eacStatusAuthenticated);
        Boolean(json, "effectiveSecure", server == null ? (bool?)null : server.secure);
        Number(json, "effectiveEncryption", server == null ? (int?)null : server.encryption);
        Boolean(json, "eacInterfaceAvailable", EACServer.ValidInterface);
        bool steamValid = Steamworks.SteamServer.IsValid;
        Boolean(json, "steamInterfaceValid", steamValid);
        Boolean(json, "steamLoggedOn", steamValid ? (bool?)Steamworks.SteamServer.LoggedOn : null);
        return json.ToString();
    }

    private static void Number(StringBuilder json, string name, int? value)
    {
        json.Append(",\"").Append(name).Append("\":").Append(value.HasValue
            ? value.Value.ToString(CultureInfo.InvariantCulture) : "null");
    }

    private static void Boolean(StringBuilder json, string name, bool? value)
    {
        json.Append(",\"").Append(name).Append("\":").Append(value.HasValue
            ? (value.Value ? "true" : "false") : "null");
    }

    private void QueueWrite()
    {
        ThreadPool.QueueUserWorkItem(_ =>
        {
            lock (Gate)
            {
                try
                {
                    if (string.IsNullOrEmpty(_path)) return;
                    string json = "{\"version\":\"0.1.0\",\"startedUtc\":\"" + _startedUtc
                        + "\",\"writtenUtc\":\"" + DateTime.UtcNow.ToString("O")
                        + "\",\"unloaded\":" + (Volatile.Read(ref _unloaded) != 0 ? "true" : "false")
                        + ",\"writeErrors\":" + Volatile.Read(ref _writeErrors).ToString(CultureInfo.InvariantCulture)
                        + "," + _snapshot + "}\n";
                    string temporary = _path + ".tmp";
                    File.WriteAllText(temporary, json);
                    if (File.Exists(_path)) File.Replace(temporary, _path, null);
                    else File.Move(temporary, _path);
                }
                catch (Exception) { Interlocked.Increment(ref _writeErrors); }
            }
        });
    }

    public void OnUnloaded(OnHarmonyModUnloadedArgs args)
    {
        Volatile.Write(ref _unloaded, 1);
        QueueWrite();
    }
}
