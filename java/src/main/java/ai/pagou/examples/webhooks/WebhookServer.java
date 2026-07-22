package ai.pagou.examples.webhooks;

import ai.pagou.examples.lib.Json;
import ai.pagou.examples.lib.Logger;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.webhooks.WebhookHandlers.ParseFailure;
import ai.pagou.examples.webhooks.WebhookHandlers.ParseResult;
import ai.pagou.examples.webhooks.WebhookHandlers.WebhookEvent;
import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Webhook receiver for the three event families. It follows the rules every
// handler must: parse the envelope, require the event id, dedupe redeliveries,
// answer 2xx immediately, and offload the slow reconciliation. Business state
// is updated only inside the offloaded processor, only on confirmed events.
// Run: mvn -q compile exec:java@webhooks-server
//   (POST envelopes to http://localhost:4000/webhooks/pagou)
public final class WebhookServer {

  private static final ExecutorService WORKERS = Executors.newSingleThreadExecutor();

  private WebhookServer() {}

  public static void main(String[] args) throws IOException {
    int port = envPort(4000);
    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext("/webhooks/pagou", WebhookServer::handle);
    server.setExecutor(null);
    server.start();
    Logger.info("Webhook receiver on http://localhost:" + port + "/webhooks/pagou");
  }

  private static void handle(HttpExchange exchange) throws IOException {
    if (!"POST".equals(exchange.getRequestMethod())) {
      reply(exchange, 404, Map.of("error", "not_found"));
      return;
    }

    JsonNode body;
    try {
      body = Json.parse(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
    } catch (RuntimeException e) {
      reply(exchange, 400, Map.of("error", "invalid_json"));
      return;
    }

    ParseResult result = WebhookHandlers.parse(body);
    if (result instanceof ParseFailure failure) {
      // Documented ingestion error for a missing event id.
      reply(exchange, failure.error().equals("missing_event_id") ? 400 : 422, Map.of("error", failure.error()));
      return;
    }

    WebhookEvent event = (WebhookEvent) result;

    // Dedupe synchronously: a redelivery is acknowledged without reprocessing.
    if (!WebhookStore.markProcessed(event.id())) {
      Logger.info("Duplicate delivery ignored: " + event.id() + " (" + event.eventType() + ")");
      reply(exchange, 200, Map.of("received", true));
      return;
    }

    // Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
    // reconciliation so a slow API call never delays the response or risks a retry.
    reply(exchange, 200, Map.of("received", true));
    WORKERS.submit(
        () -> {
          try {
            WebhookProcessor.processEvent(event, new PagouHttpClient());
          } catch (RuntimeException e) {
            Logger.error("Deferred processing failed for " + event.id(), Map.of("message", String.valueOf(e.getMessage())));
          }
        });
  }

  private static void reply(HttpExchange exchange, int status, Object body) throws IOException {
    byte[] bytes = Json.stringify(body).getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, bytes.length);
    exchange.getResponseBody().write(bytes);
    exchange.close();
  }

  private static int envPort(int fallback) {
    String value = System.getenv("PORT");
    if (value == null || value.isBlank()) {
      return fallback;
    }
    try {
      return Integer.parseInt(value.trim());
    } catch (NumberFormatException e) {
      return fallback;
    }
  }
}
