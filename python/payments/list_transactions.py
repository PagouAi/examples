from pagou.http import PagouHttpClient


# Lists transactions with cursor pagination. Filters use camelCase query names
# (`paymentMethods`), while the envelope cursors are snake_case
# (`next_cursor` / `prev_cursor`). Walks up to three pages forward.
# Run: python payments/list_transactions.py
def main() -> None:
    client = PagouHttpClient()
    cursor = None

    for page_num in range(1, 4):
        query = {"limit": 5, "paymentMethods": ["pix", "credit_card"]}
        if cursor:
            query["cursor"] = cursor
            query["direction"] = "next"
        page = client.request_cursor_page("GET", "/v2/transactions", query=query).data

        print(f"\nPage {page_num} — {len(page.data)} of {page.total} total")
        for item in page.data:
            payment = item.get("payment", {})
            print(f"  {item['id']}  {item['status']:<18}  {payment.get('method')}  {payment.get('amount')}")

        if not page.next_cursor:
            print("\nNo more pages.")
            break
        cursor = page.next_cursor


if __name__ == "__main__":
    main()
