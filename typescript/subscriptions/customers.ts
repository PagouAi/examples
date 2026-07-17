import { PagouHttpClient } from "../src/lib/http.js";
import type { CreateCustomerInput, Customer } from "../src/lib/types.js";

// Customers are not an SDK resource, so both the raw and SDK subscription
// examples create/reuse a customer through the raw client.

/** Reuses PAGOU_CUSTOMER_ID when set, otherwise creates a fresh customer. */
export async function createOrReuseCustomer(client: PagouHttpClient): Promise<Customer> {
  const existing = process.env.PAGOU_CUSTOMER_ID;
  if (existing) {
    const { data } = await client.requestData<Customer>({
      method: "GET",
      path: `/v2/customers/${existing}`,
    });
    return data;
  }

  const input: CreateCustomerInput = {
    name: "Ana Souza",
    email: `ana.souza+${Date.now()}@example.com`,
    document: { type: "CPF", number: "19100000000" },
    phone: "11999990000",
    externalRef: `cust_${Date.now()}`,
  };

  const { data } = await client.requestData<Customer>({
    method: "POST",
    path: "/v2/customers",
    body: input,
  });
  return data;
}
