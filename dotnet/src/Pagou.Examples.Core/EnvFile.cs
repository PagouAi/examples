namespace Pagou.Examples.Core;

/// <summary>
/// Tiny dependency-free `.env` loader: it walks up from the working directory,
/// reads the first `.env` it finds, and sets any variable not already present in
/// the process environment. Real values live only in an untracked local `.env`.
/// </summary>
internal static class EnvFile
{
    private static bool _loaded;
    private static readonly object Gate = new();

    public static void Load()
    {
        lock (Gate)
        {
            if (_loaded)
            {
                return;
            }
            _loaded = true;

            var path = Find(".env");
            if (path is null)
            {
                return;
            }

            foreach (var raw in File.ReadAllLines(path))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith('#'))
                {
                    continue;
                }

                var separator = line.IndexOf('=');
                if (separator <= 0)
                {
                    continue;
                }

                var key = line[..separator].Trim();
                var value = line[(separator + 1)..].Trim();
                if (value.Length >= 2 &&
                    ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
                {
                    value = value[1..^1];
                }

                if (System.Environment.GetEnvironmentVariable(key) is null)
                {
                    System.Environment.SetEnvironmentVariable(key, value);
                }
            }
        }
    }

    private static string? Find(string name)
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        for (var i = 0; i < 6 && dir is not null; i++, dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, name);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }
}
