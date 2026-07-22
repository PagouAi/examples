# frozen_string_literal: true

require_relative "../lib/pagou"

# Reconciles a transaction against the API and prints the fulfillment decision.
# This is the safe pattern behind every webhook: trust the API, not the event.
# Run: ruby payments/reconcile.rb <transaction_id>
def main
  id = Pagou.resource_id_from_args("PAGOU_TRANSACTION_ID")
  result = Pagou.reconcile_transaction(id)

  unless result
    warn "No transaction #{id}."
    return
  end

  transaction = result[:transaction]
  decision = result[:decision]
  puts "Transaction #{transaction['id']} is #{transaction['status']} → decision: #{decision}"
  case decision
  when :fulfill then puts "Safe to deliver: the charge is settled."
  when :wait then puts "Not settled yet: keep the order pending and reconcile again later."
  else puts "Failed/expired: release the order."
  end
end

main if $PROGRAM_NAME == __FILE__
