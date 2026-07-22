package ai.pagou.examples;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Errors.NetworkException;
import ai.pagou.examples.lib.Errors.NotFoundException;
import ai.pagou.examples.lib.Errors.ServerException;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.PagouHttpClient.Exchange;
import ai.pagou.examples.lib.PagouHttpClient.RawResponse;
import ai.pagou.examples.lib.Request;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpRequest;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PagouHttpClientTest {

  private static final Config CONFIG =
      Config.of(Config.Environment.SANDBOX, "https://api.sandbox.pagou.ai", "test_token", 1000, 1);

  /** Records each outgoing request and replays queued responses in order. */
  private static final class RecordingExchange implements Exchange {
    final List<HttpRequest> requests = new ArrayList<>();
    final Deque<Object> responses = new ArrayDeque<>();

    RecordingExchange respond(int status, String body) {
      responses.add(new RawResponse(status, Map.of("content-type", "application/json"), body));
      return this;
    }

    RecordingExchange throwTimeout() {
      responses.add(new HttpTimeoutException("timed out"));
      return this;
    }

    @Override
    public RawResponse send(HttpRequest request, Duration timeout) throws HttpTimeoutException {
      requests.add(request);
      Object next = responses.isEmpty() ? responses.peekLast() : responses.poll();
      if (next instanceof HttpTimeoutException e) {
        throw e;
      }
      return (RawResponse) next;
    }
  }

  @Test
  void unwrapsDataEnvelope() {
    RecordingExchange exchange =
        new RecordingExchange().respond(200, "{\"success\":true,\"requestId\":\"req_1\",\"data\":{\"id\":\"tx_1\"}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    var result = client.requestData(Request.get("/v2/transactions/tx_1"), JsonNode.class);
    assertEquals("tx_1", result.data().get("id").asText());
    assertEquals("req_1", result.requestId());
  }

  @Test
  void sendsAuthorizationAndCorrelationId() {
    RecordingExchange exchange = new RecordingExchange().respond(200, "{\"success\":true,\"requestId\":\"r\",\"data\":{}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);
    client.requestData(Request.get("/v2/transactions"), JsonNode.class);

    HttpRequest sent = exchange.requests.get(0);
    assertEquals("Bearer test_token", sent.headers().firstValue("Authorization").orElse(null));
    assertTrue(sent.headers().firstValue("X-Request-Id").orElse("").matches("[0-9a-f-]{36}"));
  }

  @Test
  void mapsNotFoundWithoutRetrying() {
    RecordingExchange exchange = new RecordingExchange().respond(404, "{\"message\":\"not found\",\"code\":\"NOT_FOUND\"}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    assertThrows(NotFoundException.class, () -> client.requestData(Request.get("/v2/transactions/x"), JsonNode.class));
    assertEquals(1, exchange.requests.size());
  }

  @Test
  void retriesServerErrorOnGetThenSucceeds() {
    RecordingExchange exchange =
        new RecordingExchange()
            .respond(500, "{\"message\":\"boom\"}")
            .respond(200, "{\"success\":true,\"requestId\":\"r\",\"data\":{\"ok\":true}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    var result = client.requestData(Request.get("/v2/transactions"), JsonNode.class);
    assertTrue(result.data().get("ok").asBoolean());
    assertEquals(2, exchange.requests.size());
  }

  @Test
  void doesNotRetryPostWithoutIdempotencyKey() {
    RecordingExchange exchange = new RecordingExchange().respond(500, "{\"message\":\"boom\"}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    assertThrows(
        ServerException.class,
        () -> client.requestData(Request.post("/v2/transactions").body(Map.of()), JsonNode.class));
    assertEquals(1, exchange.requests.size());
  }

  @Test
  void retriesPostWhenIdempotencyKeyPresent() {
    RecordingExchange exchange =
        new RecordingExchange()
            .respond(503, "{\"message\":\"unavailable\"}")
            .respond(200, "{\"success\":true,\"requestId\":\"r\",\"data\":{\"id\":\"tx\"}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    var result =
        client.requestData(
            Request.post("/v2/transactions").body(Map.of()).idempotencyKey("idem_1"), JsonNode.class);
    assertEquals("tx", result.data().get("id").asText());
    assertEquals("idem_1", exchange.requests.get(0).headers().firstValue("Idempotency-Key").orElse(null));
  }

  @Test
  void raisesNetworkErrorWithTimeoutMessage() {
    RecordingExchange exchange = new RecordingExchange().throwTimeout();
    PagouHttpClient client =
        new PagouHttpClient(
            Config.of(Config.Environment.SANDBOX, "https://api.sandbox.pagou.ai", "t", 30, 0), exchange);

    NetworkException error =
        assertThrows(NetworkException.class, () -> client.requestData(Request.get("/v2/transactions"), JsonNode.class));
    assertEquals("Request timed out", error.getMessage());
  }

  @Test
  void serializesArrayQueryParamsAsCommaJoined() {
    RecordingExchange exchange =
        new RecordingExchange()
            .respond(200, "{\"success\":true,\"requestId\":\"r\",\"data\":[],\"next_cursor\":null,\"prev_cursor\":null,\"total\":0}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);
    client.requestCursorPage(
        Request.get("/v2/transactions").query(Map.of("paymentMethods", List.of("pix", "credit_card"))), JsonNode.class);

    String query = exchange.requests.get(0).uri().getQuery();
    assertTrue(query.contains("paymentMethods=pix,credit_card"), query);
  }

  @Test
  void assertsInstanceForClarity() {
    RecordingExchange exchange = new RecordingExchange().respond(401, "{\"message\":\"unauthorized\"}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);
    Throwable error =
        assertThrows(RuntimeException.class, () -> client.requestData(Request.get("/v2/transactions"), JsonNode.class));
    assertInstanceOf(ai.pagou.examples.lib.Errors.AuthenticationException.class, error);
  }
}
