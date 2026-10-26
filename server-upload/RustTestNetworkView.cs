using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using Oxide.Core.Libraries.Covalence;

namespace Oxide.Plugins
{
    [Info("RustTestNetworkView", "Local Testing", "0.1.0")]
    [Description("Administrator-only, explicitly simulated network display. Does not change connections or reporting.")]
    public sealed class RustTestNetworkView : RustPlugin
    {
        private sealed class Entry
        {
            public Network.Connection Connection;
            public string Alias, SimulatedIp;
            public int SimulatedPingMs;
            public DateTime ExpiresUtc;
        }

        private const int Capacity = 50;
        private readonly Dictionary<ulong, Entry> _entries = new Dictionary<ulong, Entry>();
        private readonly Random _random = new Random();
        private int _nextAlias;
        private Oxide.Plugins.Timer _expiryTimer;

        private void Init() { _expiryTimer = timer.Every(30f, Prune); }

        private void Unload()
        {
            if (_expiryTimer != null) { _expiryTimer.Destroy(); _expiryTimer = null; }
            _entries.Clear();
        }

        private static bool Authorize(ConsoleSystem.Arg arg)
        {
            if (arg == null) return false;
            if (arg.IsRcon || arg.Connection == null) return true;
            arg.ReplyWith(new { error = "server_console_or_rcon_required" });
            return false;
        }

        private static bool TryId(string text, out ulong id)
        {
            id = 0;
            return text != null && text.Length == 17 && text.StartsWith("7656119", StringComparison.Ordinal)
                && ulong.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out id);
        }

        private static object ReadMember(object instance, string name)
        {
            if (instance == null) return null;
            Type type = instance.GetType();
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
            FieldInfo field = type.GetField(name, flags);
            if (field != null) return field.GetValue(instance);
            PropertyInfo property = type.GetProperty(name, flags);
            return property == null ? null : property.GetValue(instance, null);
        }

        private Network.Connection FindConnection(ulong id)
        {
            IPlayer player = covalence.Players.FindPlayerById(id.ToString(CultureInfo.InvariantCulture));
            if (player == null || !player.IsConnected) return null;
            // Read public members only, without loading game binaries or
            // requiring a particular BasePlayer compile-time assembly.
            var connection = ReadMember(ReadMember(player.Object, "net"), "connection") as Network.Connection;
            return connection != null && connection.connected && connection.userid == id ? connection : null;
        }

        private void Prune()
        {
            var expired = new List<ulong>();
            DateTime utc = DateTime.UtcNow;
            foreach (var pair in _entries)
                if (pair.Value.ExpiresUtc <= utc || !object.ReferenceEquals(FindConnection(pair.Key), pair.Value.Connection))
                    expired.Add(pair.Key);
            foreach (ulong id in expired) _entries.Remove(id);
        }

        private void OnUserDisconnected(IPlayer player)
        {
            ulong id;
            if (player != null && TryId(player.Id, out id))
            {
                Entry entry;
                // A delayed disconnect hook for an older connection must not
                // remove a newly selected connection with the same identity.
                if (_entries.TryGetValue(id, out entry)
                    && !object.ReferenceEquals(FindConnection(id), entry.Connection)) _entries.Remove(id);
            }
        }

        private void AssignSimulation(Entry entry)
        {
            string[] blocks = { "192.0.2.", "198.51.100.", "203.0.113." };
            int start = _random.Next(762);
            for (int attempt = 0; attempt < 762; attempt++)
            {
                int slot = (start + attempt) % 762;
                string ip = blocks[slot / 254] + ((slot % 254) + 1).ToString(CultureInfo.InvariantCulture);
                bool occupied = false;
                foreach (Entry other in _entries.Values)
                    if (other.SimulatedIp == ip) { occupied = true; break; }
                if (occupied) continue;
                entry.SimulatedIp = ip;
                entry.SimulatedPingMs = _random.Next(10, 201);
                return;
            }
            throw new InvalidOperationException("Simulation address pool exhausted.");
        }

        private static object View(Entry entry)
        {
            return new { alias = entry.Alias, source = "simulation", simulated = true,
                simulatedIp = entry.SimulatedIp, simulatedPingMs = entry.SimulatedPingMs,
                expiresUtc = entry.ExpiresUtc.ToString("O"), networkChanged = false, publicReportingChanged = false };
        }

        [ConsoleCommand("testnetwork.add")]
        private void Add(ConsoleSystem.Arg arg)
        {
            if (!Authorize(arg)) return;
            ulong id;
            int minutes = 15;
            if (!arg.HasArgs(1) || arg.HasArgs(3) || !TryId(arg.GetString(0, null), out id)
                || (arg.HasArgs(2) && (!int.TryParse(arg.GetString(1, null), NumberStyles.None, CultureInfo.InvariantCulture, out minutes)
                    || minutes < 1 || minutes > 60)))
            { arg.ReplyWith(new { error = "usage_testnetwork.add_steamid64_optional_minutes_1_to_60" }); return; }
            Prune();
            Network.Connection connection = FindConnection(id);
            if (connection == null) { arg.ReplyWith(new { error = "connected_player_required" }); return; }
            Entry entry;
            if (!_entries.TryGetValue(id, out entry))
            {
                if (_entries.Count >= Capacity) { arg.ReplyWith(new { error = "simulation_capacity_50" }); return; }
                entry = new Entry { Connection = connection,
                    Alias = "TEST-" + (++_nextAlias).ToString("D3", CultureInfo.InvariantCulture) };
                AssignSimulation(entry);
                _entries.Add(id, entry);
            }
            entry.ExpiresUtc = DateTime.UtcNow.AddMinutes(minutes);
            arg.ReplyWith(View(entry));
        }

        [ConsoleCommand("testnetwork.rotate")]
        private void Rotate(ConsoleSystem.Arg arg)
        {
            if (!Authorize(arg)) return;
            Prune();
            foreach (Entry entry in _entries.Values) AssignSimulation(entry);
            arg.ReplyWith(new { status = "simulation_rotated", count = _entries.Count, simulated = true, networkChanged = false });
        }

        [ConsoleCommand("testnetwork.snapshot")]
        private void Snapshot(ConsoleSystem.Arg arg)
        {
            if (!Authorize(arg)) return;
            Prune();
            var rows = new List<object>();
            foreach (Entry entry in _entries.Values) rows.Add(View(entry));
            arg.ReplyWith(new { plugin = "RustTestNetworkView", version = "0.1.0", source = "simulation", simulated = true,
                networkChanged = false, publicReportingChanged = false, rows = rows.ToArray() });
        }

        [ConsoleCommand("testnetwork.remove")]
        private void Remove(ConsoleSystem.Arg arg)
        {
            if (!Authorize(arg)) return;
            ulong id;
            if (!arg.HasArgs(1) || arg.HasArgs(2) || !TryId(arg.GetString(0, null), out id))
            { arg.ReplyWith(new { error = "usage_testnetwork.remove_steamid64" }); return; }
            arg.ReplyWith(new { removed = _entries.Remove(id), simulated = true, networkChanged = false });
        }

        [ConsoleCommand("testnetwork.clear")]
        private void Clear(ConsoleSystem.Arg arg)
        {
            if (!Authorize(arg)) return;
            int count = _entries.Count;
            _entries.Clear();
            arg.ReplyWith(new { status = "simulation_cleared", removed = count, networkChanged = false });
        }
    }
}
