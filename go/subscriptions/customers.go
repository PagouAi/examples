package subscriptions

import (
	"fmt"
	"os"
	"time"

	"github.com/PagouAi/examples/go/internal/pagou"
)

// CreateOrReuseCustomer reuses PAGOU_CUSTOMER_ID when set, otherwise creates a
// fresh customer. Customers are demonstrated with the raw client across the
// examples.
func CreateOrReuseCustomer(client *pagou.Client) (pagou.Customer, error) {
	if existing := os.Getenv("PAGOU_CUSTOMER_ID"); existing != "" {
		res, err := pagou.RequestData[pagou.Customer](client, pagou.RequestParams{
			Method: "GET",
			Path:   fmt.Sprintf("/v2/customers/%s", existing),
		})
		return res.Data, err
	}

	now := time.Now().UnixMilli()
	input := pagou.CreateCustomerInput{
		Name:        "Ana Souza",
		Email:       fmt.Sprintf("ana.souza+%d@example.com", now),
		Document:    pagou.Document{Type: "CPF", Number: "19100000000"},
		Phone:       "11999990000",
		ExternalRef: fmt.Sprintf("cust_%d", now),
	}

	res, err := pagou.RequestData[pagou.Customer](client, pagou.RequestParams{
		Method: "POST",
		Path:   "/v2/customers",
		Body:   input,
	})
	return res.Data, err
}
