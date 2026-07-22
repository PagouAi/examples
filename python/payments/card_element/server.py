import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from pagou.config import load_config
from pagou.http import PagouHttpClient
from pagou.logger import logger

# Minimal server for the browser card flow. It serves the Payment Element page
# (injecting only the publishable key) and exposes POST /api/pay, which turns
# the browser's pgct_ token into a real charge via POST /v2/transactions.
# Run: python payments/card_element/server.py  then open http://localhost:3000

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))
_TOKEN_RE = re.compile(r"^pg(ct|pm)_")

# Synthetic buyer/products (kept local so the demo has no cross-flow import).
_DEMO_BUYER = {
    "name": "Ana Souza",
    "email": "ana.souza@example.com",
    "document": {"type": "CPF", "number": "19100000000"},
}
_DEMO_PRODUCTS = [{"name": "Pro Plan", "price": 4900, "quantity": 1}]

config = load_config()
client = PagouHttpClient(config)


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
        if self.path in ("/", "/index.html"):
            html = (HERE / "index.html").read_text(encoding="utf-8")
            publishable_key = config.publishable_key or "pk_test_set_PAGOU_PUBLISHABLE_KEY"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(html.replace("__PUBLISHABLE_KEY__", publishable_key).encode("utf-8"))
            return
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"Not found")

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        if self.path != "/api/pay":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            token = json.loads(self.rfile.read(length) or b"{}").get("token")
            if not token or not _TOKEN_RE.match(token):
                self._send_json(400, {"error": "A pgct_/pgpm_ token is required."})
                return

            payload = {
                "amount": 4900,
                "method": "credit_card",
                "currency": "BRL",
                "token": token,
                "installments": 1,
                "buyer": _DEMO_BUYER,
                "products": _DEMO_PRODUCTS,
                "external_ref": f"card_{int(time.time() * 1000)}",
            }
            tx = client.request_data("POST", "/v2/transactions", body=payload).data

            # Return id/status/next_action so the browser SDK can continue 3DS.
            # Do NOT fulfill here — wait for the confirmed webhook.
            self._send_json(
                200,
                {"data": {"id": tx["id"], "status": tx["status"], "next_action": tx.get("next_action")}},
            )
        except Exception as error:  # noqa: BLE001 - reference server keeps a single guard
            logger.error("Request failed", {"message": str(error)})
            self._send_json(500, {"error": "Unexpected error"})

    def log_message(self, *_args) -> None:  # keep stdout clean; use the redacting logger
        pass


def main() -> None:
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    logger.info(f"Card demo on http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
