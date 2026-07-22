package ai.pagou.examples.lib;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Masks sensitive values before anything is logged so secrets, tokens and card
 * data never reach stdout or a log sink.
 */
public final class Redactor {

  private static final Set<String> SENSITIVE_KEYS =
      Set.of(
          "authorization",
          "apikey",
          "api_key",
          "token",
          "access_token",
          "client_secret",
          "secret",
          "password",
          "cvv",
          "cvc",
          "pan",
          "card_number",
          "number");

  private static final Pattern[] TOKEN_PATTERNS = {
    Pattern.compile("\\bBearer\\s+[A-Za-z0-9._-]+", Pattern.CASE_INSENSITIVE),
    Pattern.compile("\\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+"),
  };

  private static final String REDACTED = "[REDACTED]";

  private Redactor() {}

  /** Masks bearer tokens and {@code pg*_} tokens embedded in a free-text string. */
  public static String redactString(String value) {
    String out = value;
    for (Pattern pattern : TOKEN_PATTERNS) {
      out = pattern.matcher(out).replaceAll(REDACTED);
    }
    return out;
  }

  /** Deep-copies a JSON tree with sensitive keys masked and tokens scrubbed. */
  public static JsonNode redact(JsonNode node) {
    if (node == null || node.isNull()) {
      return node;
    }
    if (node.isTextual()) {
      return Json.MAPPER.getNodeFactory().textNode(redactString(node.asText()));
    }
    if (node.isArray()) {
      ArrayNode out = Json.MAPPER.createArrayNode();
      for (JsonNode item : node) {
        out.add(redact(item));
      }
      return out;
    }
    if (node.isObject()) {
      ObjectNode out = Json.MAPPER.createObjectNode();
      Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
      while (fields.hasNext()) {
        Map.Entry<String, JsonNode> entry = fields.next();
        if (SENSITIVE_KEYS.contains(entry.getKey().toLowerCase())) {
          out.put(entry.getKey(), REDACTED);
        } else {
          out.set(entry.getKey(), redact(entry.getValue()));
        }
      }
      return out;
    }
    return node;
  }

  /** Convenience: redact an arbitrary object by round-tripping through JSON. */
  public static JsonNode redactValue(Object value) {
    return redact(Json.MAPPER.valueToTree(value));
  }
}
