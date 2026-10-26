using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Oxide.Ext.RustPresenceBridge
{
    internal static class Json
    {
        internal static string Write(object value)
        {
            if (value == null) return "null";
            if (value is bool) return (bool)value ? "true" : "false";
            if (value is int) return ((int)value).ToString(CultureInfo.InvariantCulture);
            var dictionary = value as IDictionary<string, object>;
            if (dictionary != null)
            {
                var entries = new List<string>();
                foreach (var entry in dictionary) entries.Add(Write(entry.Key) + ":" + Write(entry.Value));
                return "{" + string.Join(",", entries.ToArray()) + "}";
            }
            if (!(value is string)) throw new InvalidOperationException("Unsupported report field.");
            var result = new StringBuilder("\"");
            foreach (char c in (string)value)
            {
                if (c == '\\' || c == '"') { result.Append('\\'); result.Append(c); }
                else if (c < 32 || char.IsSurrogate(c)) result.Append("\\u" + ((int)c).ToString("x4", CultureInfo.InvariantCulture));
                else result.Append(c);
            }
            return result.Append('"').ToString();
        }
    }
}
