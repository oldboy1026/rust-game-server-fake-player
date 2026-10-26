using System;
using System.Globalization;
using System.Reflection;

namespace Oxide.Plugins
{
    [Info("RustPresenceRefresh", "Local Research", "0.1.0")]
    [Description("Manual normal player metadata refresh and count diagnostics for an existing authenticated player.")]
    public sealed class RustPresenceRefresh : RustPlugin
    {
        private DateTime _nextRefreshUtc = DateTime.MinValue;

        private static bool Allowed(ConsoleSystem.Arg arg)
        {
            return arg != null && (arg.IsRcon || arg.Connection == null || arg.Connection.authLevel >= 2);
        }

        private static BasePlayer Find(ulong id)
        {
            foreach (BasePlayer player in BasePlayer.activePlayerList)
                if (player != null && player.userID == id) return player;
            return null;
        }

        private static Network.Connection Connection(BasePlayer player)
        {
            if (player == null || player.net == null || Network.Net.sv == null) return null;
            var connection = player.net.connection;
            if (connection == null || connection.userid != player.userID) return null;
            foreach (Network.Connection actual in Network.Net.sv.connections)
                if (object.ReferenceEquals(actual, connection)) return connection;
            return null;
        }

        private static bool ParseId(ConsoleSystem.Arg arg, out ulong id)
        {
            id = 0;
            string text = arg.GetString(0, string.Empty);
            return arg.HasArgs(1) && !arg.HasArgs(2) && text.Length == 17
                && ulong.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out id);
        }

        private static object State(ulong id)
        {
            var server = Network.Net.sv;
            BasePlayer player = id == 0 ? null : Find(id);
            var connection = Connection(player);
            bool steamValid = Steamworks.SteamServer.IsValid;
            return new
            {
                utc = DateTime.UtcNow.ToString("O"),
                activePlayers = BasePlayer.activePlayerList.Count,
                networkConnections = server == null ? (int?)null : server.connections.Count,
                secure = server == null ? (bool?)null : server.secure,
                steamInterfaceValid = steamValid,
                steamLoggedOn = steamValid ? (bool?)Steamworks.SteamServer.LoggedOn : null,
                publishedTags = steamValid ? Steamworks.SteamServer.GameTags : null,
                eacInterfaceAvailable = EACServer.ValidInterface,
                targetRequested = id != 0,
                targetActive = player != null,
                targetConnected = player != null && player.IsConnected,
                targetReceivingSnapshot = player != null && player.IsReceivingSnapshot,
                targetNetworkConnected = connection != null && connection.connected,
                targetNetworkAuthenticated = connection != null && connection.isAuthenticated,
                targetEacMapped = connection != null && EACServer.GetClient(connection) != IntPtr.Zero,
                targetEacStatusAuthenticated = connection != null && EACServer.IsAuthenticated(connection),
                note = "Local diagnostics, not a Facepunch count receipt or independent EAC session proof."
            };
        }

        [ConsoleCommand("rustpresence.snapshot")]
        private void Snapshot(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!Allowed(arg)) { arg.ReplyWith(new { error = "forbidden" }); return; }
            ulong id = 0;
            if (arg.HasArgs(1) && !ParseId(arg, out id))
            { arg.ReplyWith(new { error = "usage: rustpresence.snapshot [SteamID64]" }); return; }
            try { arg.ReplyWith(State(id)); }
            catch (Exception) { arg.ReplyWith(new { error = "snapshot_failed" }); }
        }

        [ConsoleCommand("rustpresence.refresh")]
        private void Refresh(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!Allowed(arg)) { arg.ReplyWith(new { error = "forbidden" }); return; }
            ulong id;
            if (!ParseId(arg, out id))
            { arg.ReplyWith(new { error = "usage: rustpresence.refresh SteamID64" }); return; }
            if (DateTime.UtcNow < _nextRefreshUtc)
            { arg.ReplyWith(new { error = "cooldown_30_seconds" }); return; }
            try
            {
                BasePlayer player = Find(id);
                var connection = Connection(player);
                if (player == null || !player.IsConnected || player.IsReceivingSnapshot
                    || connection == null || !connection.connected || !connection.isAuthenticated)
                { arg.ReplyWith(new { error = "target_not_a_ready_authenticated_player", snapshot = State(id) }); return; }
                if (!Steamworks.SteamServer.IsValid || !Steamworks.SteamServer.LoggedOn || PlatformService.Instance == null)
                { arg.ReplyWith(new { error = "steam_platform_unavailable" }); return; }
                if (Network.Net.sv.secure && (!EACServer.ValidInterface
                    || EACServer.GetClient(connection) == IntPtr.Zero || !EACServer.IsAuthenticated(connection)))
                { arg.ReplyWith(new { error = "protected_target_not_authenticated", snapshot = State(id) }); return; }

                // Only the existing original zero-argument method is eligible.
                MethodInfo update = typeof(ServerMgr).GetMethod("UpdateServerInformation",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                    null, Type.EmptyTypes, null);
                if (update == null || update.ReturnType != typeof(void) || ServerMgr.Instance == null)
                { arg.ReplyWith(new { error = "server_information_method_unavailable" }); return; }
                object before = State(id);
                _nextRefreshUtc = DateTime.UtcNow.AddSeconds(30);
                // This wrapper returns void. Completion is not a native bool or a backend adoption receipt.
                PlatformService.Instance.UpdatePlayerSession(player.userID, player.displayName);
                update.Invoke(ServerMgr.Instance, new object[0]);
                arg.ReplyWith(new
                {
                    status = "normal_refresh_invoked",
                    before = before, after = State(id),
                    backendAccepted = (bool?)null,
                    note = "Compare new Facepunch Last-Modified batches in the local web dashboard."
                });
            }
            catch (Exception)
            {
                // A failure may occur after the first call; do not imply transaction rollback.
                arg.ReplyWith(new { error = "refresh_failed_or_partially_invoked", backendAccepted = (bool?)null });
            }
        }
    }
}
