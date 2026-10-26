using System;
using System.Collections.Generic;
using System.Globalization;
using Oxide.Core;
using Oxide.Core.Extensions;
using Oxide.Core.Plugins;

[assembly: System.Reflection.AssemblyVersion("0.1.0.0")]

namespace Oxide.Ext.RustPresenceBridge
{
    public sealed class RustPresenceBridgeExtension : Extension
    {
        public RustPresenceBridgeExtension(ExtensionManager manager) : base(manager) { }
        public override string Name { get { return "RustPresenceBridge"; } }
        public override string Author { get { return "Local Research"; } }
        public override VersionNumber Version { get { return new VersionNumber(0, 1, 0); } }
        public override bool SupportsReloading { get { return false; } }
        public override void Load() { Manager.RegisterPluginLoader(new BridgeLoader()); }
    }

    internal sealed class BridgeLoader : PluginLoader
    {
        public override Type[] CorePlugins { get { return new Type[] { typeof(BridgePlugin) }; } }
        public override IEnumerable<string> ScanDirectory(string directory) { return new string[0]; }
    }

    public sealed class BridgePlugin : CSPlugin
    {
        private DateTime _nextRefresh = DateTime.MinValue;
        public BridgePlugin()
        {
            Name = "RustPresenceBridge"; Title = "Rust Presence Bridge";
            Author = "Local Research"; Version = new VersionNumber(0, 1, 0);
        }

        [HookMethod("Init")]
        private void Init()
        {
            var command = GetLibrary<Oxide.Game.Rust.Libraries.Command>();
            command.AddConsoleCommand("rustpresencebridge.snapshot", this, "Snapshot");
            command.AddConsoleCommand("rustpresencebridge.refresh", this, "Refresh");
        }

        private static bool Allowed(ConsoleSystem.Arg arg)
        {
            return arg != null && (arg.IsRcon || arg.Connection == null || arg.Connection.authLevel >= 2);
        }

        private static bool Target(ConsoleSystem.Arg arg, bool required, out ulong id)
        {
            id = 0;
            if (!required && !arg.HasArgs(1)) return true;
            string text = arg.GetString(0, string.Empty);
            return arg.HasArgs(1) && !arg.HasArgs(2) && text.Length == 17
                && ulong.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out id);
        }

        private static Dictionary<string, object> Report(string status)
        {
            return new Dictionary<string, object> {
                { "bridge", "RustPresenceBridge" }, { "version", "0.1.0" },
                { "status", status }, { "utc", DateTime.UtcNow.ToString("O") },
                { "backendAccepted", null }
            };
        }

        private static void Reply(ConsoleSystem.Arg arg, Dictionary<string, object> report)
        {
            arg.ReplyWith(Json.Write(report));
        }

        [HookMethod("Snapshot")]
        private void Snapshot(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!Allowed(arg)) { Reply(arg, Report("forbidden")); return; }
            ulong id;
            if (!Target(arg, false, out id)) { Reply(arg, Report("invalid_target")); return; }
            try
            {
                var report = Report("snapshot");
                report["snapshot"] = new RuntimeAdapter().Capture(id);
                Reply(arg, report);
            }
            catch (Exception) { Reply(arg, Report("incompatible_runtime_or_snapshot_failed")); }
        }

        [HookMethod("Refresh")]
        private void Refresh(ConsoleSystem.Arg arg)
        {
            if (arg == null) return;
            if (!Allowed(arg)) { Reply(arg, Report("forbidden")); return; }
            ulong id;
            if (!Target(arg, true, out id)) { Reply(arg, Report("invalid_target")); return; }
            if (DateTime.UtcNow < _nextRefresh) { Reply(arg, Report("cooldown_30_seconds")); return; }
            var report = Report("refresh_not_invoked");
            report["playerUpdateReturned"] = false; report["serverInformationReturned"] = false;
            try
            {
                var runtime = new RuntimeAdapter();
                report["before"] = runtime.Capture(id);
                string rejection = runtime.CheckReady();
                if (rejection != null) { report["status"] = rejection; Reply(arg, report); return; }
                _nextRefresh = DateTime.UtcNow.AddSeconds(30);
                report["status"] = "refresh_failed_or_partially_invoked";
                runtime.UpdatePlayer(); report["playerUpdateReturned"] = true;
                runtime.UpdateServer(); report["serverInformationReturned"] = true;
                report["after"] = runtime.Capture(id);
                report["status"] = "normal_refresh_invoked";
            }
            catch (Exception)
            {
                if ((string)report["status"] == "refresh_not_invoked") report["status"] = "incompatible_runtime_or_snapshot_failed";
            }
            Reply(arg, report);
        }
    }
}
