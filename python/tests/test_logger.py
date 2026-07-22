from pagou.logger import redact


def test_masks_sensitive_keys():
    out = redact({"Authorization": "Bearer abc", "token": "pgct_123", "amount": 4900})
    assert out["Authorization"] == "[REDACTED]"
    assert out["token"] == "[REDACTED]"
    assert out["amount"] == 4900


def test_masks_card_tokens_and_bearer_in_free_text():
    assert redact("charge with pgct_secret123") == "charge with [REDACTED]"
    assert redact("header Bearer sk_live_xyz here") == "header [REDACTED] here"


def test_redacts_nested_structures():
    out = redact({"buyer": {"name": "Ana", "document": {"number": "19100000000"}}})
    assert out["buyer"]["name"] == "Ana"
    assert out["buyer"]["document"]["number"] == "[REDACTED]"


def test_handles_circular_references():
    obj = {"a": 1}
    obj["self"] = obj
    out = redact(obj)
    assert out["self"] == "[Circular]"
