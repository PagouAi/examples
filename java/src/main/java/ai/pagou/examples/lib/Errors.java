package ai.pagou.examples.lib;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * The typed error hierarchy surfaced by {@link PagouHttpClient}. Every exception
 * is unchecked so the runnable examples stay readable; catch the specific
 * subtype (e.g. {@link ConflictException}) to branch on a documented outcome.
 */
public class Errors {

  private Errors() {}

  /** Base class for every error surfaced by the raw HTTP reference client. */
  public static class ApiException extends RuntimeException {
    private final Integer status;
    private final String code;
    private final String requestId;
    private final transient JsonNode details;

    public ApiException(String message, Integer status, String code, String requestId, JsonNode details, Throwable cause) {
      super(message, cause);
      this.status = status;
      this.code = code;
      this.requestId = requestId;
      this.details = details;
    }

    public Integer status() {
      return status;
    }

    public String code() {
      return code;
    }

    public String requestId() {
      return requestId;
    }

    public JsonNode details() {
      return details;
    }
  }

  public static class AuthenticationException extends ApiException { // 401
    public AuthenticationException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class PermissionException extends ApiException { // 403
    public PermissionException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class InvalidRequestException extends ApiException { // 400/422 and other 4xx
    public InvalidRequestException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class NotFoundException extends ApiException { // 404
    public NotFoundException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class ConflictException extends ApiException { // 409 (e.g. duplicate external_ref)
    public ConflictException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class RateLimitException extends ApiException { // 429
    public RateLimitException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class ServerException extends ApiException { // 5xx
    public ServerException(String m, Integer s, String c, String r, JsonNode d) { super(m, s, c, r, d, null); }
  }

  public static class NetworkException extends ApiException { // transport failure / timeout
    public NetworkException(String m, String r, Throwable cause) { super(m, null, null, r, null, cause); }
  }

  /** Maps an HTTP status + response body to the matching typed error. */
  public static ApiException toApiError(int status, JsonNode body, String requestIdFromHeader) {
    String message = firstText(body, "message", "detail", "title", "error", "Request failed");
    String code = textOrNull(body, "code");
    if (code == null) {
      code = textOrNull(body, "error");
    }
    String requestId = firstText(body, "requestId", "request_id", null, null, requestIdFromHeader);
    JsonNode details = pick(body, "errors", "details");

    return switch (status) {
      case 401 -> new AuthenticationException(message, status, code, requestId, details);
      case 403 -> new PermissionException(message, status, code, requestId, details);
      case 404 -> new NotFoundException(message, status, code, requestId, details);
      case 409 -> new ConflictException(message, status, code, requestId, details);
      case 429 -> new RateLimitException(message, status, code, requestId, details);
      default ->
          status >= 500
              ? new ServerException(message, status, code, requestId, details)
              : new InvalidRequestException(message, status, code, requestId, details);
    };
  }

  private static String firstText(JsonNode body, String k1, String k2, String k3, String k4, String fallback) {
    if (body != null && body.isObject()) {
      for (String key : new String[] {k1, k2, k3, k4}) {
        if (key == null) {
          continue;
        }
        JsonNode v = body.get(key);
        if (v != null && v.isTextual() && !v.asText().isBlank()) {
          return v.asText();
        }
      }
    }
    return fallback;
  }

  private static String textOrNull(JsonNode body, String key) {
    if (body != null && body.isObject()) {
      JsonNode v = body.get(key);
      if (v != null && v.isTextual()) {
        return v.asText();
      }
    }
    return null;
  }

  private static JsonNode pick(JsonNode body, String k1, String k2) {
    if (body != null && body.isObject()) {
      if (body.has(k1)) {
        return body.get(k1);
      }
      if (body.has(k2)) {
        return body.get(k2);
      }
    }
    return null;
  }
}
