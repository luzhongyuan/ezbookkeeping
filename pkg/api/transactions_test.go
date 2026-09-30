package api

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/models"
)

func TestGetTransactionsInDeletionOrder_EmptyList(t *testing.T) {
	transactions := make([]*models.Transaction, 0)
	actualTransactions := Transactions.getTransactionsInDeletionOrder(transactions)

	assert.NotNil(t, actualTransactions)
	assert.Equal(t, 0, len(actualTransactions))
}

func TestGetTransactionsInDeletionOrder_RefundBeforeRelatedTransaction(t *testing.T) {
	transactions := []*models.Transaction{
		{
			TransactionId: 1001,
			Type:          models.TRANSACTION_DB_TYPE_EXPENSE,
		},
		{
			TransactionId:        1002,
			Type:                 models.TRANSACTION_DB_TYPE_INCOME,
			RelatedTransactionId: 1001,
		},
	}

	actualTransactions := Transactions.getTransactionsInDeletionOrder(transactions)

	assert.Equal(t, []int64{1002, 1001}, getTransactionIds(actualTransactions))
}

func TestGetTransactionsInDeletionOrder_TransferOutBeforeTransferIn(t *testing.T) {
	transactions := []*models.Transaction{
		{
			TransactionId: 2001,
			Type:          models.TRANSACTION_DB_TYPE_TRANSFER_IN,
			RelatedId:     2002,
		},
		{
			TransactionId: 2002,
			Type:          models.TRANSACTION_DB_TYPE_TRANSFER_OUT,
			RelatedId:     2001,
		},
	}

	actualTransactions := Transactions.getTransactionsInDeletionOrder(transactions)

	assert.Equal(t, []int64{2002, 2001}, getTransactionIds(actualTransactions))
}

func TestGetTransactionsInDeletionOrder_MixedTransactions(t *testing.T) {
	transactions := []*models.Transaction{
		{
			TransactionId: 3001,
			Type:          models.TRANSACTION_DB_TYPE_EXPENSE,
		},
		{
			TransactionId:        3002,
			Type:                 models.TRANSACTION_DB_TYPE_INCOME,
			RelatedTransactionId: 3001,
		},
		{
			TransactionId: 3003,
			Type:          models.TRANSACTION_DB_TYPE_INCOME,
		},
		{
			TransactionId: 3004,
			Type:          models.TRANSACTION_DB_TYPE_TRANSFER_OUT,
			RelatedId:     3005,
		},
		{
			TransactionId: 3005,
			Type:          models.TRANSACTION_DB_TYPE_TRANSFER_IN,
			RelatedId:     3004,
		},
		{
			TransactionId: 3006,
			Type:          models.TRANSACTION_DB_TYPE_MODIFY_BALANCE,
		},
	}

	actualTransactions := Transactions.getTransactionsInDeletionOrder(transactions)
	actualTransactionIds := getTransactionIds(actualTransactions)

	// the refund transaction and the transfer out transaction are deleted first, all transactions are kept
	assert.Equal(t, []int64{3002, 3004, 3001, 3003, 3005, 3006}, actualTransactionIds)
	assert.ElementsMatch(t, getTransactionIds(transactions), actualTransactionIds)
}

func getTransactionIds(transactions []*models.Transaction) []int64 {
	transactionIds := make([]int64, 0, len(transactions))

	for i := 0; i < len(transactions); i++ {
		transactionIds = append(transactionIds, transactions[i].TransactionId)
	}

	return transactionIds
}
