package ai.pagou.examples;

import static org.junit.jupiter.api.Assertions.assertEquals;

import ai.pagou.examples.lib.Json;
import ai.pagou.examples.lib.Redactor;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

class RedactorTest {

  @Test
  void masksSensitiveKeys() {
    JsonNode out = Redactor.redact(Json.parse("{\"Authorization\":\"Bearer abc\",\"token\":\"pgct_123\",\"amount\":4900}"));
    assertEquals("[REDACTED]", out.get("Authorization").asText());
    assertEquals("[REDACTED]", out.get("token").asText());
    assertEquals(4900, out.get("amount").asInt());
  }

  @Test
  void masksCardTokensAndBearerStringsInFreeText() {
    assertEquals("charge with [REDACTED]", Redactor.redactString("charge with pgct_secret123"));
    assertEquals("header [REDACTED] here", Redactor.redactString("header Bearer sk_live_xyz here"));
  }

  @Test
  void redactsNestedStructures() {
    JsonNode out = Redactor.redact(Json.parse("{\"buyer\":{\"name\":\"Ana\",\"document\":{\"number\":\"19100000000\"}}}"));
    JsonNode document = out.get("buyer").get("document");
    assertEquals("Ana", out.get("buyer").get("name").asText());
    assertEquals("[REDACTED]", document.get("number").asText());
  }
}
