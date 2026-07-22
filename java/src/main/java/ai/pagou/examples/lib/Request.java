package ai.pagou.examples.lib;

import java.util.Map;

/** Parameters for a single API request. Build with the fluent factory methods. */
public final class Request {
  final String method;
  final String path;
  Map<String, Object> query;
  Object body;
  String idempotencyKey;
  String requestId;
  Long timeoutMs;

  private Request(String method, String path) {
    this.method = method;
    this.path = path;
  }

  public static Request get(String path) {
    return new Request("GET", path);
  }

  public static Request post(String path) {
    return new Request("POST", path);
  }

  public static Request put(String path) {
    return new Request("PUT", path);
  }

  public static Request patch(String path) {
    return new Request("PATCH", path);
  }

  public static Request delete(String path) {
    return new Request("DELETE", path);
  }

  public Request query(Map<String, Object> query) {
    this.query = query;
    return this;
  }

  public Request body(Object body) {
    this.body = body;
    return this;
  }

  /** Sent as {@code Idempotency-Key}; also makes a write retryable on transient failures. */
  public Request idempotencyKey(String key) {
    this.idempotencyKey = key;
    return this;
  }

  /** Correlation id echoed as {@code X-Request-Id}. Auto-generated when omitted. */
  public Request requestId(String requestId) {
    this.requestId = requestId;
    return this;
  }

  public Request timeoutMs(long timeoutMs) {
    this.timeoutMs = timeoutMs;
    return this;
  }
}
