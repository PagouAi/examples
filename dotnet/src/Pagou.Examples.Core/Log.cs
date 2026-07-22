namespace Pagou.Examples.Core;

/// <summary>
/// Minimal structured logger. Every context object is passed through
/// <see cref="Redactor"/> before it is written, so secrets and card data never
/// reach the output.
/// </summary>
public static class Log
{
    public static void Info(string message, object? context = null) => Emit(Console.Out, message, context);

    public static void Warn(string message, object? context = null) => Emit(Console.Error, message, context);

    public static void Error(string message, object? context = null) => Emit(Console.Error, message, context);

    private static void Emit(TextWriter writer, string message, object? context)
    {
        if (context is null)
        {
            writer.WriteLine(message);
            return;
        }

        var node = Redactor.RedactToNode(context);
        writer.WriteLine($"{message} {node?.ToJsonString() ?? "null"}");
    }
}
