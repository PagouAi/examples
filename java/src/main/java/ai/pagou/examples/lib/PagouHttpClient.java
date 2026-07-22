package ai.pagou.examples.lib;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Minimal, dependency-light reference client for the Pagou API v2 built on the
 * JDK's {@link java.net.http.HttpClient}. It demonstrates the fundamentals every
 * language example must show: server-side auth, correlation ids, idempotency
 * keys, timeouts, bounded retries for transient failures on idempotent
 * operations, typed errors and redacted logging.
 */
public final class PagouHttpClient {

  private static final Set<Integer> RETRYABLE_STATUS = Set.of(429, 500, 502, 503, 504);
  private static final Set<String> IDEMPOTENT_METHODS = Set.of("GET", "HEAD");

  private final Config config;
  private final Exchange exchange;

  public PagouHttpClient() {
    this(Config.load());
  }

  public PagouHttpClient(Config config) {
    this(config, defaultExchange());
  }

  /** Test seam: inject an {@link Exchange} that returns canned responses. */
  public PagouHttpClient(Config config, Exchange exchange) {
    this.config = config;
    this.exchange = exchange;
  }

  /** A single HTTP round-trip. The default implementation uses the JDK client. */
  public interface Exchange {
    RawResponse send(HttpRequest request, Duration timeout)
        throws IOException, InterruptedException;
  }

  public record RawResponse(int status, Map<String, String> headers, String body) {
    public String header(String name) {
      for (Map.Entry<String, String> e : headers.entrySet()) {
        if (e.getKey().equalsIgnoreCase(name)) {
          return e.getValue();
        }
      }
      return null;
    }
  }

  public record Result<T>(T data, int status, String requestId) {}

  public record CursorPage<T>(
      boolean success, String requestId, List<T> data, String nextCursor, String prevCursor, long total) {}

  private static Exchange defaultExchange() {
    HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    return (request, timeout) -> {
      HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
      Map<String, String> headers = new java.util.HashMap<>();
      response.headers().map().forEach((k, v) -> headers.put(k, v.isEmpty() ? "" : v.get(0)));
      return new RawResponse(response.statusCode(), headers, response.body());
    };
  }

  private boolean canRetry(String method, String idempotencyKey) {
    if (IDEMPOTENT_METHODS.contains(method)) {
      return true;
    }
    // Writes are retried only when an idempotency key guards against duplicates.
    return ("POST".equals(method) || "PUT".equals(method)) && idempotencyKey != null;
  }

  /** Performs a request and returns the raw parsed JSON body. */
  public Result<JsonNode> request(Request params) {
    String requestId = params.requestId != null ? params.requestId : UUID.randomUUID().toString();
    URI url = buildUrl(params.path, params.query);
    boolean retryable = canRetry(params.method, params.idempotencyKey);
    int maxAttempts = retryable ? config.maxRetries + 1 : 1;

    Logger.info(
        "→ " + params.method + " " + url.getRawPath() + query(url),
        Map.of("requestId", requestId, "body", params.body == null ? "" : params.body));

    for (int attempt = 0; attempt < maxAttempts; attempt++) {
      Duration timeout = Duration.ofMillis(params.timeoutMs != null ? params.timeoutMs : config.timeoutMs);
      HttpRequest httpRequest = buildRequest(url, params, requestId, timeout);
      try {
        RawResponse response = exchange.send(httpRequest, timeout);
        String responseId = response.header("x-request-id");
        if (responseId == null) {
          responseId = requestId;
        }
        JsonNode payload = parseBody(response);

        if (response.status() < 200 || response.status() >= 300) {
          if (retryable && RETRYABLE_STATUS.contains(response.status()) && attempt < maxAttempts - 1) {
            sleep(backoffMs(attempt, response.header("Retry-After")));
            continue;
          }
          Errors.ApiException error = Errors.toApiError(response.status(), payload, responseId);
          Logger.warn(
              "← " + response.status() + " " + params.method + " " + url.getRawPath(),
              Map.of("requestId", responseId, "code", error.code() == null ? "" : error.code()));
          throw error;
        }

        Logger.info(
            "← " + response.status() + " " + params.method + " " + url.getRawPath(),
            Map.of("requestId", responseId));
        return new Result<>(payload, response.status(), responseId);
      } catch (HttpTimeoutException e) {
        if (retryable && attempt < maxAttempts - 1) {
          sleep(backoffMs(attempt, null));
          continue;
        }
        throw new Errors.NetworkException("Request timed out", requestId, e);
      } catch (IOException e) {
        // Retry transport failures on idempotent operations only.
        if (retryable && attempt < maxAttempts - 1) {
          sleep(backoffMs(attempt, null));
          continue;
        }
        throw new Errors.NetworkException("Network request failed", requestId, e);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new Errors.NetworkException("Request interrupted", requestId, e);
      }
    }
    throw new Errors.NetworkException("Request failed after retries", requestId, null);
  }

  /** Unwraps a {@code { success, requestId, data }} envelope to its {@code data}. */
  public <T> Result<T> requestData(Request params, Class<T> type) {
    Result<JsonNode> result = request(params);
    JsonNode envelope = result.data();
    JsonNode data = envelope != null && envelope.has("data") ? envelope.get("data") : envelope;
    String requestId =
        envelope != null && envelope.hasNonNull("requestId")
            ? envelope.get("requestId").asText()
            : result.requestId();
    return new Result<>(Json.convert(data, type), result.status(), requestId);
  }

  /** Returns a full cursor page (keeps {@code next_cursor}/{@code prev_cursor}/{@code total}). */
  public <T> Result<CursorPage<T>> requestCursorPage(Request params, Class<T> itemType) {
    Result<JsonNode> result = request(params);
    JsonNode env = result.data();
    List<T> items = new ArrayList<>();
    if (env != null && env.has("data") && env.get("data").isArray()) {
      for (JsonNode item : env.get("data")) {
        items.add(Json.convert(item, itemType));
      }
    }
    CursorPage<T> page =
        new CursorPage<>(
            env != null && env.path("success").asBoolean(false),
            env != null && env.hasNonNull("requestId") ? env.get("requestId").asText() : result.requestId(),
            items,
            text(env, "next_cursor"),
            text(env, "prev_cursor"),
            env != null ? env.path("total").asLong(0) : 0);
    return new Result<>(page, result.status(), page.requestId());
  }

  private HttpRequest buildRequest(URI url, Request params, String requestId, Duration timeout) {
    HttpRequest.Builder builder =
        HttpRequest.newBuilder(url)
            .timeout(timeout)
            .header("Accept", "application/json")
            .header("X-Request-Id", requestId)
            // The API key is a server-side secret; it is never read in browser code.
            .header("Authorization", "Bearer " + config.apiToken);
    if (params.idempotencyKey != null) {
      builder.header("Idempotency-Key", params.idempotencyKey);
    }

    HttpRequest.BodyPublisher publisher;
    if (params.body != null) {
      builder.header("Content-Type", "application/json");
      publisher = HttpRequest.BodyPublishers.ofString(Json.stringify(params.body));
    } else {
      publisher = HttpRequest.BodyPublishers.noBody();
    }
    return builder.method(params.method, publisher).build();
  }

  private URI buildUrl(String path, Map<String, Object> query) {
    StringBuilder sb = new StringBuilder(config.baseUrl);
    if (!path.startsWith("/")) {
      sb.append('/');
    }
    sb.append(path);
    if (query != null && !query.isEmpty()) {
      List<String> parts = new ArrayList<>();
      for (Map.Entry<String, Object> entry : query.entrySet()) {
        Object value = entry.getValue();
        if (value == null) {
          continue;
        }
        if (value instanceof List<?> list) {
          if (list.isEmpty()) {
            continue;
          }
          List<String> asStrings = new ArrayList<>();
          for (Object item : list) {
            asStrings.add(String.valueOf(item));
          }
          parts.add(enc(entry.getKey()) + "=" + enc(String.join(",", asStrings)));
        } else {
          parts.add(enc(entry.getKey()) + "=" + enc(String.valueOf(value)));
        }
      }
      if (!parts.isEmpty()) {
        sb.append('?').append(String.join("&", parts));
      }
    }
    return URI.create(sb.toString());
  }

  private static String enc(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private static String query(URI url) {
    return url.getRawQuery() == null ? "" : "?" + url.getRawQuery();
  }

  private JsonNode parseBody(RawResponse response) {
    if (response.body() == null || response.body().isEmpty()) {
      return null;
    }
    try {
      return Json.parse(response.body());
    } catch (RuntimeException e) {
      return Json.MAPPER.getNodeFactory().textNode(response.body());
    }
  }

  private static String text(JsonNode node, String field) {
    if (node != null && node.hasNonNull(field)) {
      return node.get(field).asText();
    }
    return null;
  }

  static long backoffMs(int attempt, String retryAfter) {
    if (retryAfter != null) {
      try {
        double seconds = Double.parseDouble(retryAfter.trim());
        return (long) Math.min(seconds * 1000, 5000);
      } catch (NumberFormatException ignored) {
        // fall through to exponential backoff
      }
    }
    long base = 200L * (1L << attempt);
    long jitter = (long) Math.floor(deterministicJitter(attempt) * 200);
    return Math.min(base + jitter, 5000);
  }

  // Small deterministic jitter keeps the reference reproducible without randomness.
  private static double deterministicJitter(int attempt) {
    double x = Math.sin(attempt + 1) * 10_000;
    return x - Math.floor(x);
  }

  private static void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
