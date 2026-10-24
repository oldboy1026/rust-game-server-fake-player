using System;
using System.IO;
using System.Reflection;
using UnityEngine;

// Offline only. Uses the operator's existing Rust.Data decoder, with synthetic
// fixtures from test_rust_player_tick.py. Does not load Assembly-CSharp, start
// Unity, open sockets, read credentials or modify the server installation.
public static class PlayerTickInterop
{
    private static int assertions;
    private static void Check(bool condition)
    {
        assertions++;
        if (!condition) throw new InvalidOperationException("interop_assertion_failed");
    }

    private static void EqualVector(Vector3 actual, float x, float y, float z)
    {
        Check(actual.x == x && actual.y == y && actual.z == z);
    }

    private static void FillNonzero(object instance)
    {
        foreach (FieldInfo field in instance.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
        {
            if (field.Name == "ShouldPool") continue;
            Type type = field.FieldType;
            if (type == typeof(Vector3)) field.SetValue(instance, new Vector3(123, 456, 789));
            else if (type == typeof(float)) field.SetValue(instance, 123f);
            else if (type == typeof(int)) field.SetValue(instance, 123);
            else if (type == typeof(uint)) field.SetValue(instance, 123u);
            else if (type == typeof(bool)) field.SetValue(instance, true);
            else if (type.IsValueType)
            {
                object value = Activator.CreateInstance(type);
                foreach (FieldInfo inner in type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance))
                    if (inner.FieldType == typeof(ulong)) inner.SetValue(value, 123UL);
                field.SetValue(instance, value);
            }
        }
    }

    private static BufferStream Stream(byte[] bytes, int length)
    {
        // Unity's mscorlib defines Span<T> in a different assembly identity.
        // Select the byte[] overload without binding the unrelated Span API.
        return (BufferStream)typeof(BufferStream).GetMethod("Initialize", new Type[] { typeof(byte[]), typeof(int) })
            .Invoke(new BufferStream(), new object[] { bytes, length });
    }

    private static void Run(string fixtures)
    {
        for (int i = 0; i < 3; i++)
        {
            var tick = new PlayerTick { inputState = new InputMessage(), modelState = new ModelState() };
            FillNonzero(tick);
            FillNonzero(tick.inputState);
            FillNonzero(tick.modelState);
            Check(!tick.parentID.Equals(default(NetworkableId)));
            Check(!tick.activeItem.Equals(default(ItemId)));
            byte[] packet = File.ReadAllBytes(Path.Combine(fixtures, "tick-" + i + ".bin"));
            Check(packet[0] == 0x9b);
            byte[] body = new byte[packet.Length - 1];
            Array.Copy(packet, 1, body, 0, body.Length);
            var input = Stream(body, body.Length);
            PlayerTick.Deserialize(input, tick, true); // Real delta merge over nonzero baseline.
            Check(input.Position == input.Length);
            Check(tick.inputState.buttons == (i == 1 ? 64 : 0));
            EqualVector(tick.inputState.aimAngles, 0, 90, 0);
            EqualVector(tick.inputState.mouseDelta, 0, 0, 0);
            EqualVector(tick.position, 0, 20, 0);
            EqualVector(tick.eyePos, 0, 21.5f, 0);
            Check(tick.parentID.Equals(default(NetworkableId)));
            Check(tick.activeItem.Equals(default(ItemId)));
            Check(tick.deltaMs == 50);
            foreach (FieldInfo field in typeof(ModelState).GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (field.Name == "ShouldPool") continue;
                object actual = field.GetValue(tick.modelState);
                object expected = field.Name == "flags" ? (object)4
                    : field.Name == "poseType" ? (object)11 : Activator.CreateInstance(field.FieldType);
                Check(actual.Equals(expected));
            }
            // The server can record/full-serialize the reconstructed packet,
            // including its mandatory inputState/modelState objects.
            var output = Stream(new byte[8192], 0);
            PlayerTick.Serialize(output, tick);
            Check(output.Position > 0);
        }
        Console.WriteLine("{\"success\":true,\"packets\":3,\"assertions\":" + assertions + "}");
    }

    public static int Main(string[] args)
    {
        if (args.Length != 2) return 2;
        string managed = Path.GetFullPath(args[0]);
        AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs request)
        {
            string path = Path.Combine(managed, new AssemblyName(request.Name).Name + ".dll");
            return File.Exists(path) ? Assembly.LoadFrom(path) : null;
        };
        try { Run(args[1]); return 0; }
        catch (Exception error)
        {
            Console.WriteLine("{\"success\":false,\"errorType\":\"" + error.GetType().Name + "\"}");
            return 1;
        }
    }
}
