# frozen_string_literal: true

# Entry point for the Pagou API v2 reference library. Require this from any
# example script: require_relative "../lib/pagou".
module Pagou
end

require_relative "pagou/errors"
require_relative "pagou/logger"
require_relative "pagou/config"
require_relative "pagou/statuses"
require_relative "pagou/format"
require_relative "pagou/http_client"
require_relative "pagou/reconcile"
require_relative "pagou/demo_data"
