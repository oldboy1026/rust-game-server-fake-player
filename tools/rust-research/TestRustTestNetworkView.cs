// Isolated fixture: compiles alongside the unchanged production source.
// No game binaries, live accounts, network, or target server are used.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Oxide.Plugins;
using Oxide.Core.Libraries.Covalence;

namespace Network { public sealed class Connection { public ulong userid; public bool connected; public string ipaddress; public int ActualPing; public int authLevel; } }
public static class ConsoleSystem
{
    public sealed class Arg
    {
        public bool IsRcon; public Network.Connection Connection; public string[] Arguments; public object Reply;
        public bool HasArgs(int count) { return Arguments != null && Arguments.Length >= count; }
        public string GetString(int index, string fallback) { return HasArgs(index + 1) ? Arguments[index] : fallback; }
        public void ReplyWith(object value) { Reply = value; }
    }
}
namespace Oxide.Core.Libraries.Covalence
{
    public interface IPlayer { string Id { get; } bool IsConnected { get; } object Object { get; } }
    public sealed class Players
    {
        public readonly Dictionary<string, IPlayer> Values = new Dictionary<string, IPlayer>();
        public IPlayer FindPlayerById(string id) { IPlayer value; return Values.TryGetValue(id, out value) ? value : null; }
    }
    public sealed class Covalence { public readonly Players Players = new Players(); }
}
namespace Oxide.Plugins
{
    public sealed class InfoAttribute : Attribute { public InfoAttribute(string name, string author, string version) {} }
    public sealed class DescriptionAttribute : Attribute { public DescriptionAttribute(string value) {} }
    public sealed class ConsoleCommandAttribute : Attribute { public ConsoleCommandAttribute(string value) {} }
    public sealed class Timer { public bool Destroyed; public void Destroy() { Destroyed = true; } }
    public sealed class Timers { public readonly Timer Last = new Timer(); public Timer Every(float seconds, Action action) { return Last; } }
    public abstract class RustPlugin { public readonly Covalence covalence = new Covalence(); public readonly Timers timer = new Timers(); }
}
public sealed class FixtureNetwork { public Network.Connection connection { get; set; } }
public class FixtureBase { public FixtureNetwork net = new FixtureNetwork(); }
public sealed class FixturePlayer : FixtureBase, IPlayer
{
    public string Id { get; set; } public bool IsConnected { get; set; } public object Object { get { return this; } }
}
public static class NetworkViewTests
{
    private static int _checks;
    private const BindingFlags Hidden = BindingFlags.Instance | BindingFlags.NonPublic;
    private static readonly ulong Seed = 7656119UL * 10000000000UL;
    private static void Check(bool pass, string message) { _checks++; if (!pass) throw new Exception(message); }
    private static object Get(object value, string name) { return value.GetType().GetProperty(name).GetValue(value, null); }
    private static IDictionary Entries(RustTestNetworkView plugin) { return (IDictionary)plugin.GetType().GetField("_entries", Hidden).GetValue(plugin); }
    private static object Call(RustTestNetworkView plugin, string name, ConsoleSystem.Arg arg)
    { plugin.GetType().GetMethod(name, Hidden).Invoke(plugin, new object[] { arg }); return arg == null ? null : arg.Reply; }
    private static ConsoleSystem.Arg Args(params string[] args) { return new ConsoleSystem.Arg { IsRcon = true, Arguments = args }; }
    private static FixturePlayer AddPlayer(RustTestNetworkView plugin, int index)
    {
        string id = (Seed + (ulong)index).ToString(System.Globalization.CultureInfo.InvariantCulture);
        var player = new FixturePlayer { Id = id, IsConnected = true };
        player.net.connection = new Network.Connection { userid = Seed + (ulong)index, connected = true, ipaddress = "actual-fixture-address", ActualPing = 418 };
        plugin.covalence.Players.Values[id] = player;
        return player;
    }
    private static object[] Rows(RustTestNetworkView plugin)
    {
        object snapshot = Call(plugin, "Snapshot", Args());
        Check((bool)Get(snapshot, "simulated") && !(bool)Get(snapshot, "networkChanged") && !(bool)Get(snapshot, "publicReportingChanged"), "snapshot labels");
        return (object[])Get(snapshot, "rows");
    }
    private static void VerifyRows(RustTestNetworkView plugin, int count)
    {
        object[] rows = Rows(plugin); Check(rows.Length == count, "row count");
        var ips = new HashSet<string>();
        foreach (object row in rows)
        {
            string ip = (string)Get(row, "simulatedIp");
            int ping = (int)Get(row, "simulatedPingMs");
            Check(ips.Add(ip), "duplicate simulation address");
            Check(ip.StartsWith("192.0.2.") || ip.StartsWith("198.51.100.") || ip.StartsWith("203.0.113."), "documentation range");
            int last = int.Parse(ip.Substring(ip.LastIndexOf('.') + 1)); Check(last >= 1 && last <= 254, "host address");
            Check(ping >= 10 && ping <= 200, "simulated latency bounds");
            Check((string)Get(row, "source") == "simulation" && (bool)Get(row, "simulated"), "row labels");
            Check(row.GetType().GetProperty("userid") == null && row.GetType().GetProperty("ipaddress") == null, "raw identity not exposed");
        }
    }
    public static void Main()
    {
        var plugin = new RustTestNetworkView();
        plugin.GetType().GetMethod("Init", Hidden).Invoke(plugin, null);
        FixturePlayer first = AddPlayer(plugin, 1);
        foreach (string command in new[] { "Add", "Rotate", "Snapshot", "Remove", "Clear" })
        {
            var denied = new ConsoleSystem.Arg { Connection = new Network.Connection { authLevel = 2 }, Arguments = new[] { first.Id } };
            object result = Call(plugin, command, denied);
            Check((string)Get(result, "error") == "server_console_or_rcon_required" && Entries(plugin).Count == 0, "ingame denied");
            Call(plugin, command, null);
        }
        foreach (string[] invalid in new[] { new string[0], new[] { "invalid" }, new[] { first.Id, "0" }, new[] { first.Id, "61" }, new[] { first.Id, "1", "extra" } })
            Check(Get(Call(plugin, "Add", Args(invalid)), "error") != null && Entries(plugin).Count == 0, "invalid selection");
        Check((string)Get(Call(plugin, "Add", Args((Seed + 900).ToString())), "error") == "connected_player_required", "offline rejected");
        var console = new ConsoleSystem.Arg { Arguments = new[] { first.Id, "1" } };
        object initial = Call(plugin, "Add", console);
        object again = Call(plugin, "Add", Args(first.Id, "60"));
        Check((string)Get(initial, "simulatedIp") == (string)Get(again, "simulatedIp"), "repeat preserves address");
        Check((int)Get(initial, "simulatedPingMs") == (int)Get(again, "simulatedPingMs"), "repeat preserves latency");
        for (int i = 2; i <= 50; i++) { FixturePlayer player = AddPlayer(plugin, i); Call(plugin, "Add", Args(player.Id)); }
        VerifyRows(plugin, 50);
        FixturePlayer overflow = AddPlayer(plugin, 51);
        Check((string)Get(Call(plugin, "Add", Args(overflow.Id)), "error") == "simulation_capacity_50", "capacity enforced");
        for (int pass = 0; pass < 100; pass++) { Call(plugin, "Rotate", Args()); VerifyRows(plugin, 50); }
        foreach (IPlayer player in plugin.covalence.Players.Values.Values)
        {
            var fixture = (FixturePlayer)player;
            Check(fixture.net.connection.ipaddress == "actual-fixture-address" && fixture.net.connection.ActualPing == 418 && fixture.net.connection.connected, "real connection preserved");
        }
        first.net.connection = new Network.Connection { userid = Seed + 1, connected = true, ipaddress = "replacement-fixture-address", ActualPing = 500 };
        Check(Rows(plugin).Length == 49, "reconnect requires new selection");
        Call(plugin, "Add", Args(first.Id));
        plugin.GetType().GetMethod("OnUserDisconnected", Hidden).Invoke(plugin, new object[] { first });
        Check(Rows(plugin).Length == 50, "late disconnect preserves new lease");
        object entry = Entries(plugin)[Seed + 1];
        entry.GetType().GetField("ExpiresUtc").SetValue(entry, DateTime.UtcNow.AddSeconds(-1));
        Check(Rows(plugin).Length == 49, "expired lease removed");
        Call(plugin, "Add", Args(first.Id)); first.IsConnected = false; first.net.connection.connected = false;
        plugin.GetType().GetMethod("OnUserDisconnected", Hidden).Invoke(plugin, new object[] { first });
        Check(Rows(plugin).Length == 49, "disconnect removes simulation");
        Check((bool)Get(Call(plugin, "Remove", Args((Seed + 2).ToString())), "removed") && Rows(plugin).Length == 48, "selected removal");
        Call(plugin, "Clear", Args()); Check(Rows(plugin).Length == 0, "clear");
        Call(plugin, "Add", Args(overflow.Id));
        plugin.GetType().GetMethod("Unload", Hidden).Invoke(plugin, null);
        Check(Entries(plugin).Count == 0 && plugin.timer.Last.Destroyed, "unload clears and destroys timer");
        Console.WriteLine("Isolated network-view checks passed: " + _checks);
    }
}
