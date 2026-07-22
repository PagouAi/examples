import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from handlers import ParseFailure, parse_webhook
from processor import process_event
from store import mark_processed

from pagou.logger import logger

# Webhook receiver for the three event families. It follows the rules every
# handler must: parse the envelope, require the event id, dedupe redeliveries,
# answer 2xx immediately, and offload the slow reconciliation. Business state
# is updated only inside the offloaded processor, only on confirmed events.
# Run: python webhooks/server.py  (POST envelopes to http://localhost:4000/webhooks/pagou)

PORT = int(os.environ.get("PORT", "4000"))


def _offload(event) -> None:
    try:
        process_event(event)
    except Exception as error:  # noqa: BLE001 - deferred work must not crash the server
        logger.error(f"Deferred processing failed for {event.id}", {"message": str(error)})


class Handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        if self.path != "/webhooks/pagou":
            self._reply(404, {"error": "not_found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        try:
            parsed_body = json.loads(self.rfile.read(length) or b"")
        except ValueError:
            self._reply(400, {"error": "invalid_json"})
            return

        event = parse_webhook(parsed_body)
        if isinstance(event, ParseFailure):
            # Documented ingestion error for a missing event id.
            self._reply(400 if event.error == "missing_event_id" else 422, {"error": event.error})
            return

        # Dedupe synchronously: a redelivery is acknowledged without reprocessing.
        if not mark_processed(event.id):
            logger.info(f"Duplicate delivery ignored: {event.id} ({event.event_type})")
            self._reply(200, {"received": True})
            return

        # Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
        # reconciliation so a slow API call never delays the response or risks a retry.
        self._reply(200, {"received": True})
        threading.Thread(target=_offload, args=(event,), daemon=True).start()

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
        self._reply(404, {"error": "not_found"})

    def log_message(self, *_args) -> None:  # keep stdout clean; use the redacting logger
        pass


def main() -> None:
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    logger.info(f"Webhook receiver on http://localhost:{PORT}/webhooks/pagou")
    server.serve_forever()


if __name__ == "__main__":
    main()
