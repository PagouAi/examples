package ai.pagou.examples;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Json;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.PagouHttpClient.Exchange;
import ai.pagou.examples.lib.PagouHttpClient.RawResponse;
import ai.pagou.examples.webhooks.WebhookHandlers;
import ai.pagou.examples.webhooks.WebhookHandlers.Family;
import ai.pagou.examples.webhooks.WebhookHandlers.ParseFailure;
import ai.pagou.examples.webhooks.WebhookHandlers.ParseResult;
import ai.pagou.examples.webhooks.WebhookHandlers.WebhookEvent;
import ai.pagou.examples.webhooks.WebhookProcessor;
import ai.pagou.examples.webhooks.WebhookStore;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WebhooksTest {

  private static final Config CONFIG =
      Config.of(Config.Environment.SANDBOX, "https://api.sandbox.pagou.ai", "test", 1000, 0);

  @BeforeEach
  void reset() {
    WebhookStore.reset();
  }

  private static JsonNode node(String json) {
    return Json.parse(json);
  }

  private static JsonNode fixture(String name) throws IOException {
    try (InputStream in = WebhooksTest.class.getResourceAsStream("/fixtures/" + name)) {
      return Json.parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  @Test
  void routesTransactionFamily() {
    ParseResult result =
        WebhookHandlers.parse(node("{\"id\":\"evt_1\",\"event\":\"transaction\",\"data\":{\"id\":\"tx_1\",\"event_type\":\"transaction.paid\"}}"));
    WebhookEvent event = assertInstanceOf(WebhookEvent.class, result);
    assertEquals("evt_1", event.id());
    assertEquals(Family.TRANSACTION, event.family());
    assertEquals("transaction.paid", event.eventType());
    assertEquals("tx_1", event.resourceId());
  }

  @Test
  void routesSubscriptionFamily() {
    WebhookEvent event =
        assertInstanceOf(
            WebhookEvent.class,
            WebhookHandlers.parse(node("{\"id\":\"evt_2\",\"event\":\"subscription\",\"data\":{\"id\":\"sub_1\",\"event_type\":\"subscription.renewed\"}}")));
    assertEquals(Family.SUBSCRIPTION, event.family());
    assertEquals("subscription.renewed", event.eventType());
    assertEquals("sub_1", event.resourceId());
  }

  @Test
  void routesTransferFamily() {
    WebhookEvent event =
        assertInstanceOf(
            WebhookEvent.class,
            WebhookHandlers.parse(node("{\"id\":\"evt_3\",\"type\":\"payout.transferred\",\"data\":{\"object\":{\"id\":\"tr_1\"}}}")));
    assertEquals(Family.TRANSFER, event.family());
    assertEquals("payout.transferred", event.eventType());
    assertEquals("tr_1", event.resourceId());
  }

  @Test
  void rejectsBodyWithoutEventId() {
    ParseFailure failure =
        assertInstanceOf(ParseFailure.class, WebhookHandlers.parse(node("{\"event\":\"transaction\",\"data\":{}}")));
    assertEquals("missing_event_id", failure.error());
  }

  @Test
  void parsesEachFamilyFixture() throws IOException {
    for (String name : new String[] {"webhook.transaction.json", "webhook.subscription.json", "webhook.transfer.json"}) {
      assertInstanceOf(WebhookEvent.class, WebhookHandlers.parse(fixture(name)));
    }
  }

  @Test
  void confirmedStateChangeGate() {
    assertTrue(WebhookHandlers.isConfirmedStateChange("transaction.paid"));
    assertTrue(WebhookHandlers.isConfirmedStateChange("payout.transferred"));
    assertFalse(WebhookHandlers.isConfirmedStateChange("transaction.created"));
    assertFalse(WebhookHandlers.isConfirmedStateChange("subscription.trial_will_end"));
  }

  @Test
  void dedupeReturnsTrueOnceThenFalse() {
    assertTrue(WebhookStore.markProcessed("evt_x"));
    assertFalse(WebhookStore.markProcessed("evt_x"));
  }

  @Test
  void reconcilesAndUpdatesStateOnConfirmedEvent() {
    AtomicInteger calls = new AtomicInteger();
    Exchange exchange = countingExchange(calls, 200, "{\"success\":true,\"requestId\":\"r\",\"data\":{\"status\":\"paid\"}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    WebhookProcessor.processEvent(
        new WebhookEvent("evt_1", Family.TRANSACTION, "transaction.paid", "tx_1", node("{}")), client);
    assertEquals(1, calls.get());
    assertEquals("paid", WebhookStore.getResourceState("tx_1").orElse(null));
  }

  @Test
  void doesNotReconcileOnNonConfirmingEvent() {
    AtomicInteger calls = new AtomicInteger();
    Exchange exchange = countingExchange(calls, 200, "{\"success\":true,\"requestId\":\"r\",\"data\":{\"status\":\"pending\"}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    WebhookProcessor.processEvent(
        new WebhookEvent("evt_2", Family.TRANSACTION, "transaction.created", "tx_2", node("{}")), client);
    assertEquals(0, calls.get());
    assertTrue(WebhookStore.getResourceState("tx_2").isEmpty());
  }

  @Test
  void skipsReconciliationWhenNoResourceId() {
    AtomicInteger calls = new AtomicInteger();
    Exchange exchange = countingExchange(calls, 200, "{\"success\":true,\"requestId\":\"r\",\"data\":{\"status\":\"paid\"}}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    WebhookProcessor.processEvent(
        new WebhookEvent("evt_3", Family.TRANSACTION, "transaction.paid", "", node("{}")), client);
    assertEquals(0, calls.get());
  }

  @Test
  void leavesStateUnchangedWhenResourceNotFound() {
    AtomicInteger calls = new AtomicInteger();
    Exchange exchange = countingExchange(calls, 404, "{\"message\":\"not found\"}");
    PagouHttpClient client = new PagouHttpClient(CONFIG, exchange);

    WebhookProcessor.processEvent(
        new WebhookEvent("evt_4", Family.TRANSFER, "payout.transferred", "tr_x", node("{}")), client);
    assertTrue(WebhookStore.getResourceState("tr_x").isEmpty());
  }

  private static Exchange countingExchange(AtomicInteger calls, int status, String body) {
    return (request, timeout) -> {
      calls.incrementAndGet();
      return new RawResponse(status, Map.of("content-type", "application/json"), body);
    };
  }
}
