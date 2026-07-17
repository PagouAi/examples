import { newId, nowIso } from './store.mjs';

export function envelope(data, extra = {}) {
  return { success: true, requestId: newId(), data, ...extra };
}

export function apiError(status, error, message) {
  return { body: { error, message, status }, status };
}

// ---- Transactions ---------------------------------------------------------

function buildBuyer(input = {}) {
  return {
    id: newId(),
    name: input.name ?? 'Test Buyer',
    email: input.email ?? 'buyer@example.com',
    phone: input.phone ?? '+5511999990000',
    birth_date: input.birth_date ?? '1990-01-01',
    document: {
      type: input.document?.type ?? 'CPF',
      number: input.document?.number ?? '00000000000',
    },
    address: {
      street: input.address?.street ?? 'Rua Example',
      number: input.address?.number ?? '100',
      complement: input.address?.complement ?? null,
      neighborhood: input.address?.neighborhood ?? 'Centro',
      city: input.address?.city ?? 'São Paulo',
      state: input.address?.state ?? 'SP',
      zipCode: input.address?.zipCode ?? '01000-000',
      country: input.address?.country ?? 'BR',
    },
  };
}

export function buildTransaction(input) {
  const id = newId();
  const created = nowIso();
  const method = input.method || 'pix';
  const base = {
    id,
    status: 'pending',
    method,
    amount: input.amount ?? 0,
    currency: input.currency || 'BRL',
    external_ref: input.external_ref ?? null,
    buyer: buildBuyer(input.buyer),
    fee: { net_amount: input.amount ?? 0, estimated_fee: 0 },
    informations: [],
    paid_amount: 0,
    refunded_amount: 0,
    products: [],
    traceable: input.traceable ?? false,
    splits: [],
    created_at: created,
    updated_at: created,
    paid_at: null,
  };

  if (method === 'pix') {
    base.pix = {
      qr_code: '000201010212_SYNTHETIC_QR_CODE_FOR_TESTS_ONLY',
      expiration_date: created,
      end_to_end_id: null,
      receipt_url: null,
    };
  } else if (method === 'voucher') {
    base.voucher = {
      barcode: '00190500954014481606906809350314337370000000100',
      digitable_line: '00190.50095 40144.816069 06809.350314 3 37370000000100',
      url: 'https://pay.example/voucher/SYNTHETIC_ONLY',
      expiration_date: created,
      instructions: 'Pay using the bank slip reference before the expiration date.',
      receipt_url: null,
    };
  } else if (method === 'credit_card') {
    base.status = 'three_ds_required';
    base.installments = input.installments ?? 1;
    base.next_action = {
      type: 'three_ds_challenge',
      challenge_session_id: newId(),
      client_secret: 'SYNTHETIC_3DS_CLIENT_SECRET_FOR_TESTS_ONLY',
      expires_at: created,
    };
  }
  return base;
}

// The transaction list item has a distinct shape (nested `payment`, `attempts_count`).
export function toTransactionListItem(txn) {
  return {
    id: txn.id,
    buyer: { name: txn.buyer?.name ?? 'Test Buyer', email: txn.buyer?.email ?? 'buyer@example.com' },
    payment: {
      method: txn.method,
      currency: txn.currency,
      country: 'BR',
      external_ref: txn.external_ref ?? null,
      amount: txn.amount ?? 0,
      base_price: txn.amount ?? 0,
      installments: txn.installments ?? null,
      fee: txn.fee ?? null,
      pix: txn.pix ?? null,
    },
    status: txn.status,
    products: [],
    paid_at: txn.paid_at ?? null,
    created_at: txn.created_at,
    updated_at: txn.updated_at,
    attempts_count: 0,
  };
}

export function buildRefund(txn, amount) {
  const paid = txn.paid_amount ?? txn.amount ?? 0;
  const already = txn.refunded_amount ?? 0;
  const refund = amount ?? paid - already;
  const totalRefunded = already + refund;
  const isFull = totalRefunded >= paid;
  return {
    message: isFull ? 'Transaction fully refunded' : 'Transaction partially refunded',
    amount_refunded: refund,
    remaining_balance: Math.max(paid - totalRefunded, 0),
    is_full_refund: isFull,
  };
}

// ---- Transfers ------------------------------------------------------------

export function buildTransfer(input) {
  const id = newId();
  const created = nowIso();
  return {
    id,
    amount: String(input.amount ?? 0),
    fee: 50,
    type: 'pix',
    pix_key: input.pix_key_value ?? null,
    pix_key_type: input.pix_key_type ?? null,
    status: 'pending',
    description: input.description ?? null,
    external_ref: input.external_ref ?? null,
    processed_at: null,
    transferred_at: null,
    created_at: created,
    updated_at: created,
  };
}

// ---- Customers ------------------------------------------------------------

export function buildCustomer(input) {
  return {
    id: newId(),
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    externalRef: input.externalRef ?? null,
  };
}

// ---- Subscriptions --------------------------------------------------------

export function buildSubscription(input) {
  const id = newId();
  const created = nowIso();
  return {
    id,
    customerId: input.customerId ?? null,
    status: 'active',
    interval: input.interval ?? 'month',
    intervalCount: input.intervalCount ?? 1,
    amount: input.amount ?? 0,
    currency: input.currency ?? 'BRL',
    trialEnd: null,
    currentPeriodStart: created,
    currentPeriodEnd: created,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    failurePolicy: input.failurePolicy ?? 'retry_then_cancel',
    retryOffsetsDays: input.retryOffsetsDays ?? [3, 5, 7],
    cancellationReason: null,
    customerEmail: input.customerEmail ?? null,
    cardLast4: null,
    metadata: input.metadata ?? {},
    products: input.products ?? [],
    transactions: [],
    createdAt: created,
    updatedAt: created,
  };
}

// ---- Checkout links -------------------------------------------------------

export function buildCheckoutLink() {
  return { url: 'https://checkout.example/link/SYNTHETIC_PUBLIC_ID_FOR_TESTS_ONLY' };
}
