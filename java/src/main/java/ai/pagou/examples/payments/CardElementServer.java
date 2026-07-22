package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Json;
import ai.pagou.examples.lib.Logger;
import ai.pagou.examples.lib.Models.CreateTransactionInput;
import ai.pagou.examples.lib.Models.Transaction;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

// Minimal server for the browser card flow. It serves the Payment Element page
// (injecting only the publishable key) and exposes POST /api/pay, which turns
// the browser's pgct_ token into a real charge via POST /v2/transactions.
// Run: mvn -q compile exec:java@pay-card-server  then open http://localhost:3000
public final class CardElementServer {

  private CardElementServer() {}

  public static void main(String[] args) throws IOException {
    Config config = Config.load();
    PagouHttpClient client = new PagouHttpClient(config);
    int port = envPort(3000);

    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext("/", exchange -> handle(exchange, config, client));
    server.setExecutor(null);
    server.start();
    Logger.info("Card demo on http://localhost:" + port);
  }

  private static void handle(HttpExchange exchange, Config config, PagouHttpClient client) {
    try {
      String method = exchange.getRequestMethod();
      String path = exchange.getRequestURI().getPath();

      if ("GET".equals(method) && ("/".equals(path) || "/index.html".equals(path))) {
        String html = loadPage();
        String publishableKey =
            config.publishableKey != null ? config.publishableKey : "pk_test_set_PAGOU_PUBLISHABLE_KEY";
        byte[] body = html.replace("__PUBLISHABLE_KEY__", publishableKey).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
        return;
      }

      if ("POST".equals(method) && "/api/pay".equals(path)) {
        JsonNode payload = Json.parse(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        String token = payload.hasNonNull("token") ? payload.get("token").asText() : null;
        if (token == null || !token.matches("^pg(ct|pm)_.*")) {
          respondJson(exchange, 400, Map.of("error", "A pgct_/pgpm_ token is required."));
          return;
        }

        CreateTransactionInput input =
            new CreateTransactionInput(
                4900, "credit_card", "BRL", DemoData.DEMO_BUYER, DemoData.DEMO_PRODUCTS,
                "card_" + System.currentTimeMillis(), 1, token, null);

        Transaction tx =
            client.requestData(Request.post("/v2/transactions").body(input), Transaction.class).data();

        // Return id/status/next_action so the browser SDK can continue 3DS.
        // Do NOT fulfill here — wait for the confirmed webhook.
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", tx.id());
        data.put("status", tx.status());
        data.put("next_action", tx.nextAction());
        respondJson(exchange, 200, Map.of("data", data));
        return;
      }

      byte[] notFound = "Not found".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(404, notFound.length);
      exchange.getResponseBody().write(notFound);
      exchange.close();
    } catch (Exception e) {
      Logger.error("Request failed", Map.of("message", String.valueOf(e.getMessage())));
      try {
        respondJson(exchange, 500, Map.of("error", "Unexpected error"));
      } catch (IOException ignored) {
        exchange.close();
      }
    }
  }

  private static void respondJson(HttpExchange exchange, int status, Object body) throws IOException {
    byte[] bytes = Json.stringify(body).getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, bytes.length);
    exchange.getResponseBody().write(bytes);
    exchange.close();
  }

  private static String loadPage() throws IOException {
    try (InputStream in = CardElementServer.class.getResourceAsStream("/card-element/index.html")) {
      if (in == null) {
        throw new IOException("card-element/index.html not found on the classpath");
      }
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
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
