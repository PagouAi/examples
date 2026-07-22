package ai.pagou.examples.lib;

import java.util.Map;

/** Tiny logger that redacts secrets in structured context before printing. */
public final class Logger {

  private Logger() {}

  public static void info(String message) {
    emit(System.out, message, null);
  }

  public static void info(String message, Map<String, ?> context) {
    emit(System.out, message, context);
  }

  public static void warn(String message) {
    emit(System.err, message, null);
  }

  public static void warn(String message, Map<String, ?> context) {
    emit(System.err, message, context);
  }

  public static void error(String message) {
    emit(System.err, message, null);
  }

  public static void error(String message, Map<String, ?> context) {
    emit(System.err, message, context);
  }

  private static void emit(java.io.PrintStream stream, String message, Map<String, ?> context) {
    String line =
        context == null ? message : message + " " + Json.stringify(Redactor.redactValue(context));
    stream.println(line);
  }
}
