namespace Oxide.Plugins
{
    [Info("CountDiagnostics", "Local Research", "0.1.2")]
    [Description("Returns one aggregate snapshot of local player and connection lists.")]
    public sealed class CountDiagnostics : RustPlugin
    {
        [ConsoleCommand("countdiag.snapshot")]
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

            var active = BasePlayer.activePlayerList;
            var sleeping = BasePlayer.sleepingPlayerList;
            var server = Network.Net.sv;
            var connections = server == null ? null : server.connections;
            int activeNonNull = 0;
            int activeSleeping = 0;
            int activeAwake = 0;
            int activeReceivingSnapshot = 0;
            int activeConnected = 0;
            int networkConnected = 0;
            int networkAuthenticated = 0;
            int eacAuthenticated = 0;

            if (active != null)
            {
                foreach (BasePlayer player in active)
                {
                    // Count managed references, including any Unity-destroyed entry.
                    if (object.ReferenceEquals(player, null))
                        continue;

                    activeNonNull++;
                    if (player.IsSleeping())
                        activeSleeping++;
                    else
                        activeAwake++;

                    if (player.IsReceivingSnapshot)
                        activeReceivingSnapshot++;
                    if (player.IsConnected)
                        activeConnected++;
                }
            }

            if (connections != null)
            {
                foreach (Network.Connection connection in connections)
                {
                    if (connection == null)
                        continue;

                    if (connection.connected)
                        networkConnected++;
                    if (connection.isAuthenticated)
                        networkAuthenticated++;
                    if (EACServer.IsAuthenticated(connection))
                        eacAuthenticated++;
                }
            }

            bool steamInterfaceValid = Steamworks.SteamServer.IsValid;

            // ReplyWith(object) serializes only this explicitly selected aggregate.
            arg.ReplyWith(new
            {
                utc = System.DateTime.UtcNow.ToString("O"),
                activeListEntries = active == null ? (int?)null : active.Count,
                activeNonNull = active == null ? (int?)null : activeNonNull,
                activeSleeping = active == null ? (int?)null : activeSleeping,
                activeAwake = active == null ? (int?)null : activeAwake,
                activeReceivingSnapshot = active == null ? (int?)null : activeReceivingSnapshot,
                activeConnected = active == null ? (int?)null : activeConnected,
                sleepingListEntries = sleeping == null ? (int?)null : sleeping.Count,
                networkConnectionEntries = connections == null ? (int?)null : connections.Count,
                networkConnectedConnections = connections == null ? (int?)null : networkConnected,
                networkAuthenticatedConnections = connections == null ? (int?)null : networkAuthenticated,
                serverSecure = server == null ? (bool?)null : server.secure,
                serverEncryption = server == null ? (int?)null : server.encryption,
                steamInterfaceValid = steamInterfaceValid,
                steamLoggedOn = steamInterfaceValid ? (bool?)Steamworks.SteamServer.LoggedOn : null,
                interfaceAvailable = EACServer.ValidInterface,
                eacAuthenticatedConnections = connections == null ? (int?)null : eacAuthenticated
            });
        }
    }
}
