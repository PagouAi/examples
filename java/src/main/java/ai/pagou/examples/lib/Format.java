package ai.pagou.examples.lib;

import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

/** Small presentation helpers shared by the runnable examples. */
public final class Format {

  private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");

  private Format() {}

  /** Formats an integer amount in the smallest currency unit as a display string. */
  public static String amount(long cents, String currency) {
    NumberFormat formatter = NumberFormat.getCurrencyInstance(PT_BR);
    try {
      formatter.setCurrency(Currency.getInstance(currency));
    } catch (IllegalArgumentException ignored) {
      // Unknown currency code: fall back to the locale default.
    }
    return formatter.format(cents / 100.0);
  }

  public static String amount(long cents) {
    return amount(cents, "BRL");
  }

  /** A short, unique idempotency key for a given operation and reference. */
  public static String idempotencyKey(String operation, String reference) {
    return operation + "_" + reference;
  }

  /** Prints a labelled JSON block for readable script output. */
  public static void printResult(String label, Object value) {
    System.out.println();
    System.out.println(label + ":");
    System.out.println(Json.pretty(value));
  }
}
