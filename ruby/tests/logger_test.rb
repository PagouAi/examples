# frozen_string_literal: true

require_relative "test_helper"

class RedactTest < Minitest::Test
  def test_masks_sensitive_keys
    out = Pagou.redact({ "Authorization" => "Bearer abc", "token" => "pgct_123", "amount" => 4900 })
    assert_equal "[REDACTED]", out["Authorization"]
    assert_equal "[REDACTED]", out["token"]
    assert_equal 4900, out["amount"]
  end

  def test_masks_card_tokens_and_bearer_strings_inside_free_text
    assert_equal "charge with [REDACTED]", Pagou.redact("charge with pgct_secret123")
    assert_equal "header [REDACTED] here", Pagou.redact("header Bearer sk_live_xyz here")
  end

  def test_redacts_nested_structures
    out = Pagou.redact({ "buyer" => { "name" => "Ana", "document" => { "number" => "19100000000" } } })
    assert_equal "Ana", out["buyer"]["name"]
    assert_equal "[REDACTED]", out["buyer"]["document"]["number"]
  end

  def test_handles_circular_references
    obj = { "a" => 1 }
    obj["self"] = obj
    out = Pagou.redact(obj)
    assert_equal "[Circular]", out["self"]
  end
end
