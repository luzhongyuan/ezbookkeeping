package services

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/models"
)

func TestOrderTransactionsForCreation_NoTransactions(t *testing.T) {
	orderedTransactions, orderedPositions, _ := OrderTransactionsForCreation([]*models.Transaction{}, []int64{})

	assert.NotNil(t, orderedTransactions)
	assert.Equal(t, 0, len(orderedTransactions))
	assert.Equal(t, 0, len(orderedPositions))
}

func TestOrderTransactionsForCreation_RefundTransactionCreatedLast(t *testing.T) {
	expenseTransaction := &models.Transaction{
		TransactionId: 9001,
		Type:          models.TRANSACTION_DB_TYPE_EXPENSE,
	}
	refundTransaction := &models.Transaction{
		TransactionId:        9002,
		Type:                 models.TRANSACTION_DB_TYPE_INCOME,
		RelatedTransactionId: 1001,
	}
	incomeTransaction := &models.Transaction{
		TransactionId: 9003,
		Type:          models.TRANSACTION_DB_TYPE_INCOME,
	}

	transactions := []*models.Transaction{expenseTransaction, refundTransaction, incomeTransaction}
	originalTransactionIds := []int64{1001, 1002, 1003}

	orderedTransactions, orderedPositions, beforeCreateTransactions := OrderTransactionsForCreation(transactions, originalTransactionIds)

	assert.Equal(t, []int{0, 2, 1}, orderedPositions)
	assert.Equal(t, []*models.Transaction{expenseTransaction, incomeTransaction, refundTransaction}, orderedTransactions)

	// simulate the new transaction ids which are generated before the transactions are created
	orderedTransactions[0].TransactionId = 8001
	orderedTransactions[1].TransactionId = 8002
	orderedTransactions[2].TransactionId = 8003

	err := beforeCreateTransactions(orderedTransactions)

	assert.Nil(t, err)
	assert.Equal(t, int64(8001), refundTransaction.RelatedTransactionId)
	assert.Equal(t, int64(0), expenseTransaction.RelatedTransactionId)
	assert.Equal(t, int64(0), incomeTransaction.RelatedTransactionId)
}

func TestOrderTransactionsForCreation_RelatedTransactionNotExists(t *testing.T) {
	refundTransaction := &models.Transaction{
		TransactionId:        9001,
		Type:                 models.TRANSACTION_DB_TYPE_INCOME,
		RelatedTransactionId: 1001,
	}

	orderedTransactions, _, beforeCreateTransactions := OrderTransactionsForCreation([]*models.Transaction{refundTransaction}, []int64{1002})

	orderedTransactions[0].TransactionId = 8001

	assert.Equal(t, errs.ErrRelatedTransactionNotFound, beforeCreateTransactions(orderedTransactions))
}
