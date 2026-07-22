package ai.pagou.examples.lib;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * Loads and validates configuration from the environment. The API token is a
 * server-side secret and is never exposed to the browser. Values are read from
 * a local {@code .env} file (when present) with process environment variables
 * taking precedence, so no third-party dotenv dependency is required.
 */
public final class Config {

  public enum Environment {
    SANDBOX,
    PRODUCTION
  }

  private static final String SANDBOX_BASE_URL = "https://api.sandbox.pagou.ai";
  private static final String PRODUCTION_BASE_URL = "https://api.pagou.ai";

  public final Environment environment;
  public final String baseUrl;
  public final String apiToken;
  public final String webhookUrl;
  public final String publishableKey;
  public final long timeoutMs;
  public final int maxRetries;

  private Config(
      Environment environment,
      String baseUrl,
      String apiToken,
      String webhookUrl,
      String publishableKey,
      long timeoutMs,
      int maxRetries) {
    this.environment = environment;
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
    this.webhookUrl = webhookUrl;
    this.publishableKey = publishableKey;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  /** Builds a config explicitly. Used by tests that inject a canned transport. */
  public static Config of(
      Environment environment, String baseUrl, String apiToken, long timeoutMs, int maxRetries) {
    return new Config(environment, baseUrl, apiToken, null, null, timeoutMs, maxRetries);
  }

  /** Loads configuration, throwing when a required variable is missing. */
  public static Config load() {
    Map<String, String> env = readDotenv();
    Environment environment = resolveEnvironment(env);
    return new Config(
        environment,
        resolveBaseUrl(env, environment),
        require(env, "PAGOU_API_TOKEN"),
        get(env, "PAGOU_WEBHOOK_URL"),
        get(env, "PAGOU_PUBLISHABLE_KEY"),
        parseLong(get(env, "PAGOU_TIMEOUT_MS"), 30_000L),
        (int) parseLong(get(env, "PAGOU_MAX_RETRIES"), 2L));
  }

  private static Environment resolveEnvironment(Map<String, String> env) {
    String raw = getOrDefault(env, "PAGOU_ENVIRONMENT", "sandbox").toLowerCase();
    return switch (raw) {
      case "sandbox" -> Environment.SANDBOX;
      case "production" -> Environment.PRODUCTION;
      default ->
          throw new IllegalStateException(
              "PAGOU_ENVIRONMENT must be \"sandbox\" or \"production\", got \"" + raw + "\".");
    };
  }

  private static String resolveBaseUrl(Map<String, String> env, Environment environment) {
    String override = get(env, "PAGOU_BASE_URL");
    if (override != null && !override.isBlank()) {
      return override.replaceAll("/$", "");
    }
    return environment == Environment.PRODUCTION ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
  }

  /** Reads a resource id from the first CLI argument or an env var. */
  public static String resourceIdFromArgs(String[] args, String envVar) {
    if (args.length > 0 && !args[0].isBlank()) {
      return args[0];
    }
    String id = System.getenv(envVar);
    if (id == null || id.isBlank()) {
      id = readDotenv().get(envVar);
    }
    if (id == null || id.isBlank()) {
      throw new IllegalArgumentException(
          "Pass a resource id as the first argument or set " + envVar + ".");
    }
    return id;
  }

  private static String require(Map<String, String> env, String name) {
    String value = get(env, name);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(
          "Missing required environment variable "
              + name
              + ". Copy .env.example to .env and set it.");
    }
    return value;
  }

  private static String get(Map<String, String> env, String name) {
    String fromProcess = System.getenv(name);
    if (fromProcess != null && !fromProcess.isBlank()) {
      return fromProcess;
    }
    return env.get(name);
  }

  private static String getOrDefault(Map<String, String> env, String name, String fallback) {
    String value = get(env, name);
    return (value == null || value.isBlank()) ? fallback : value;
  }

  private static long parseLong(String value, long fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  /** Minimal {@code .env} reader — supports {@code KEY=value} lines and comments. */
  private static Map<String, String> readDotenv() {
    Map<String, String> values = new HashMap<>();
    Path path = Path.of(".env");
    if (!Files.isRegularFile(path)) {
      return values;
    }
    try {
      for (String line : Files.readAllLines(path)) {
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) {
          continue;
        }
        int eq = trimmed.indexOf('=');
        if (eq <= 0) {
          continue;
        }
        String key = trimmed.substring(0, eq).trim();
        String value = trimmed.substring(eq + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\""))
            || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length() - 1);
        }
        values.put(key, value);
      }
    } catch (IOException e) {
      // A missing/unreadable .env is not fatal: fall back to process env only.
    }
    return values;
  }
}
