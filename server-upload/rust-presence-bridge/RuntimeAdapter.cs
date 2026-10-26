using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;

namespace Oxide.Ext.RustPresenceBridge
{
    // Resolve only these installed game types. Never load assemblies supplied by a request.
    internal sealed class RuntimeAdapter
    {
        private const BindingFlags Public = BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.FlattenHierarchy;
        private readonly Type _player, _net, _steam, _eac, _platform, _manager, _connection;
        private object _target, _targetConnection, _server;
        private MethodInfo _updatePlayer, _updateServer;
        private object _platformInstance, _managerInstance;

        internal RuntimeAdapter()
        {
            _player = TypeIn("Assembly-CSharp", "BasePlayer");
            _manager = TypeIn("Assembly-CSharp", "ServerMgr");
            _eac = TypeIn("Assembly-CSharp", "EACServer");
            _net = TypeIn("Assembly-CSharp-firstpass", "Network.Net");
            _connection = TypeIn("Facepunch.Network", "Network.Connection");
            _steam = TypeIn("Facepunch.Steamworks.Win64", "Steamworks.SteamServer");
            _platform = TypeIn("Rust.Platform", "PlatformService");
        }

        private static Type TypeIn(string assemblyName, string name)
        {
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
                if (assembly.GetName().Name == assemblyName)
                {
                    Type type = assembly.GetType(name, false);
                    if (type != null) return type;
                }
            throw new MissingMemberException("Required installed game type unavailable.");
        }

        private static object Get(Type type, object instance, string name)
        {
            FieldInfo field = type.GetField(name, Public);
            if (field != null) return field.GetValue(instance);
            PropertyInfo property = type.GetProperty(name, Public);
            if (property == null || property.GetIndexParameters().Length != 0 || property.GetGetMethod() == null)
                throw new MissingMemberException("Required public member unavailable.");
            return property.GetValue(instance, null);
        }

        private static object Get(object instance, string name)
        {
            if (instance == null) throw new MissingMemberException("Required instance unavailable.");
            return Get(instance.GetType(), instance, name);
        }

        private static bool Bool(object value)
        {
            if (!(value is bool)) throw new InvalidOperationException("Expected boolean.");
            return (bool)value;
        }

        private static MethodInfo Method(Type type, string name, BindingFlags flags, Type result, params Type[] parameters)
        {
            MethodInfo method = type.GetMethod(name, flags, null, parameters, null);
            if (method == null || method.ReturnType != result) throw new MissingMethodException("Required exact method unavailable.");
            return method;
        }

        private bool Eac(string name)
        {
            return Bool(Method(_eac, name, BindingFlags.Public | BindingFlags.Static, typeof(bool), _connection)
                .Invoke(null, new object[] { _targetConnection }));
        }

        internal Dictionary<string, object> Capture(ulong id)
        {
            _target = null; _targetConnection = null;
            object active = Get(_player, null, "activePlayerList");
            _server = Get(_net, null, "sv");
            if (_server == null || !(active is IEnumerable)) throw new InvalidOperationException("Server not ready.");
            int activeCount = 0, connectionCount = 0;
            object candidate = null;
            foreach (object player in (IEnumerable)active)
            {
                if (player == null) continue;
                activeCount++;
                if (id == 0) continue;
                object networkable = Get(player, "net");
                object connection = networkable == null ? null : Get(networkable, "connection");
                if (connection != null && _connection.IsInstanceOfType(connection) && (ulong)Get(connection, "userid") == id)
                { _target = player; candidate = connection; }
            }
            foreach (object connection in (IEnumerable)Get(_server, "connections"))
            {
                if (connection == null) continue;
                connectionCount++;
                if (object.ReferenceEquals(candidate, connection) && (ulong)Get(connection, "userid") == id)
                    _targetConnection = connection;
            }
            bool steamValid = Bool(Get(_steam, null, "IsValid"));
            bool mapped = _targetConnection != null && (IntPtr)Method(_eac, "GetClient", BindingFlags.Public | BindingFlags.Static,
                typeof(IntPtr), _connection).Invoke(null, new object[] { _targetConnection }) != IntPtr.Zero;
            return new Dictionary<string, object> {
                { "utc", DateTime.UtcNow.ToString("O") }, { "activePlayers", activeCount }, { "networkConnections", connectionCount },
                { "secure", Bool(Get(_server, "secure")) }, { "steamValid", steamValid },
                { "steamLoggedOn", steamValid && Bool(Get(_steam, null, "LoggedOn")) },
                { "publishedTags", steamValid ? Get(_steam, null, "GameTags") : null },
                { "eacInterfaceAvailable", Bool(Get(_eac, null, "ValidInterface")) },
                { "targetRequested", id != 0 }, { "targetActive", _target != null },
                { "targetConnected", _target != null && Bool(Get(_target, "IsConnected")) },
                { "targetReceivingSnapshot", _target != null && Bool(Get(_target, "IsReceivingSnapshot")) },
                { "targetNetworkConnected", _targetConnection != null && Bool(Get(_targetConnection, "connected")) },
                { "targetNetworkAuthenticated", _targetConnection != null && Bool(Get(_targetConnection, "isAuthenticated")) },
                { "targetEacMapped", mapped }, { "targetEacStatusAuthenticated", _targetConnection != null && Eac("IsAuthenticated") }
            };
        }

        internal string CheckReady()
        {
            if (_target == null || _targetConnection == null || !Bool(Get(_target, "IsConnected"))
                || Bool(Get(_target, "IsReceivingSnapshot")) || !Bool(Get(_targetConnection, "connected"))
                || !Bool(Get(_targetConnection, "isAuthenticated"))) return "target_not_a_ready_authenticated_player";
            if (!Bool(Get(_steam, null, "IsValid")) || !Bool(Get(_steam, null, "LoggedOn"))) return "steam_platform_unavailable";
            if (Bool(Get(_server, "secure")))
            {
                if (!Bool(Get(_eac, null, "ValidInterface")) || !Eac("IsAuthenticated")) return "protected_target_not_authenticated";
                IntPtr client = (IntPtr)Method(_eac, "GetClient", BindingFlags.Public | BindingFlags.Static, typeof(IntPtr), _connection)
                    .Invoke(null, new object[] { _targetConnection });
                if (client == IntPtr.Zero) return "protected_target_not_authenticated";
            }
            _platformInstance = Get(_platform, null, "Instance");
            _managerInstance = Get(_manager, null, "Instance");
            if (_platformInstance == null || _managerInstance == null) return "server_platform_unavailable";
            _updatePlayer = Method(_platformInstance.GetType(), "UpdatePlayerSession", BindingFlags.Public | BindingFlags.Instance,
                typeof(void), typeof(ulong), typeof(string));
            _updateServer = Method(_manager, "UpdateServerInformation", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance,
                typeof(void), Type.EmptyTypes);
            return null;
        }

        internal void UpdatePlayer()
        {
            _updatePlayer.Invoke(_platformInstance, new object[] { Get(_targetConnection, "userid"), Get(_target, "displayName") });
        }
        internal void UpdateServer() { _updateServer.Invoke(_managerInstance, new object[0]); }
    }
}
