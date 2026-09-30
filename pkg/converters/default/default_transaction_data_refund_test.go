package _default

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/converters/converter"
	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/models"
	"github.com/mayswind/ezbookkeeping/pkg/utils"
)

func createRefundTestData() (*models.Transaction, *models.Transaction, map[int64]*models.Account, map[int64]*models.TransactionCategory) {
	expenseTransaction := &models.Transaction{
		TransactionId:   1001,
		Uid:             123,
		Type:            models.TRANSACTION_DB_TYPE_EXPENSE,
		CategoryId:      7,
		TransactionTime: utils.GetMinTransactionTimeFromUnixTime(1735689600),
		Amount:          20000,
		AccountId:       5,
	}

	refundTransaction := &models.Transaction{
		TransactionId:        1002,
		Uid:                  123,
		Type:                 models.TRANSACTION_DB_TYPE_INCOME,
		RelatedTransactionId: 1001,
		CategoryId:           7,
		TransactionTime:      utils.GetMinTransactionTimeFromUnixTime(1735776000),
		Amount:               5000,
		AccountId:            5,
	}

	accountMap := map[int64]*models.Account{
		5: {AccountId: 5, Name: "Cash", Currency: "CNY"},
	}

	categoryMap := map[int64]*models.TransactionCategory{
		6: {CategoryId: 6, Name: "Living", Type: models.CATEGORY_TYPE_EXPENSE, ParentCategoryId: -1},
		7: {CategoryId: 7, Name: "Food", Type: models.CATEGORY_TYPE_EXPENSE, ParentCategoryId: 6},
	}

	return expenseTransaction, refundTransaction, accountMap, categoryMap
}

func TestDefaultTransactionDataCSVFileConverterExportRefundTransaction(t *testing.T) {
	expenseTransaction, refundTransaction, accountMap, categoryMap := createRefundTestData()

	content, err := DefaultTransactionDataCSVFileConverter.ToExportedContent(core.NewNullContext(), 123,
		[]*models.Transaction{expenseTransaction, refundTransaction}, accountMap, categoryMap, map[int64]*models.TransactionTag{}, map[int64][]int64{})

	assert.Nil(t, err)

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	assert.Equal(t, 3, len(lines))
	assert.Equal(t, "Transaction Id", getDataLineItem(lines[0], 14))
	assert.Equal(t, "Related Transaction Id", getDataLineItem(lines[0], 15))
	assert.Equal(t, "", getDataLineItem(lines[1], 15), "the expense transaction should not have related transaction id")
	assert.Equal(t, "Expense", getDataLineItem(lines[1], 2))
	assert.Equal(t, "1001", getDataLineItem(lines[1], 14))
	assert.Equal(t, "Refund", getDataLineItem(lines[2], 2))
	assert.Equal(t, "Food", getDataLineItem(lines[2], 4))
	assert.Equal(t, "1002", getDataLineItem(lines[2], 14))
	assert.Equal(t, "1001", getDataLineItem(lines[2], 15))
}

func TestDefaultTransactionDataCSVFileConverterExportTransactionWithoutRefundTransaction(t *testing.T) {
	expenseTransaction, _, accountMap, categoryMap := createRefundTestData()

	content, err := DefaultTransactionDataCSVFileConverter.ToExportedContent(core.NewNullContext(), 123,
		[]*models.Transaction{expenseTransaction}, accountMap, categoryMap, map[int64]*models.TransactionTag{}, map[int64][]int64{})

	assert.Nil(t, err)

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	assert.Equal(t, 2, len(lines))
	assert.Equal(t, 14, len(strings.Split(lines[0], ",")), "the transaction id columns should be exported only when there are refund transactions")
}

func TestDefaultTransactionDataCSVFileConverterParseRefundTransaction(t *testing.T) {
	expenseTransaction, refundTransaction, accountMap, categoryMap := createRefundTestData()

	content, err := DefaultTransactionDataCSVFileConverter.ToExportedContent(core.NewNullContext(), 123,
		[]*models.Transaction{expenseTransaction, refundTransaction}, accountMap, categoryMap, map[int64]*models.TransactionTag{}, map[int64][]int64{})

	assert.Nil(t, err)

	user := &models.User{
		Uid:             123,
		DefaultCurrency: "CNY",
	}

	parsedTransactions, _, newExpenseCategories, newIncomeCategories, _, _, err := DefaultTransactionDataCSVFileConverter.ParseImportedData(
		core.NewNullContext(), user, content, time.UTC, converter.DefaultImporterOptions,
		map[string]*models.Account{"Cash": accountMap[5]},
		map[string]map[string]*models.TransactionCategory{"Food": {"Living": categoryMap[7]}},
		map[string]map[string]*models.TransactionCategory{},
		map[string]map[string]*models.TransactionCategory{},
		map[string]*models.TransactionTag{})

	assert.Nil(t, err)
	assert.Equal(t, 2, len(parsedTransactions))
	assert.Equal(t, 0, len(newExpenseCategories), "the category of the refund transaction already exists")
	assert.Equal(t, 0, len(newIncomeCategories), "refund transaction should use expense category")

	importerTransactionMap := make(map[int64]*models.ImportTransaction, len(parsedTransactions))

	for _, parsedTransaction := range parsedTransactions {
		importerTransactionMap[parsedTransaction.OriginalTransactionId] = parsedTransaction
	}

	parsedExpenseTransaction := importerTransactionMap[1001]

	assert.NotNil(t, parsedExpenseTransaction)
	assert.Equal(t, models.TRANSACTION_DB_TYPE_EXPENSE, parsedExpenseTransaction.Type)
	assert.Equal(t, int64(0), parsedExpenseTransaction.RelatedTransactionId)
	assert.Equal(t, int64(20000), parsedExpenseTransaction.Amount)

	parsedRefundTransaction := importerTransactionMap[1002]

	assert.NotNil(t, parsedRefundTransaction)
	assert.Equal(t, models.TRANSACTION_DB_TYPE_INCOME, parsedRefundTransaction.Type)
	assert.Equal(t, int64(1001), parsedRefundTransaction.RelatedTransactionId)
	assert.Equal(t, int64(5000), parsedRefundTransaction.Amount)
	assert.Equal(t, int64(7), parsedRefundTransaction.CategoryId)
	assert.Equal(t, models.TRANSACTION_TYPE_REFUND, parsedRefundTransaction.ToImportTransactionResponse().Type)
}

func TestDefaultTransactionDataCSVFileConverterParseRefundTransactionWithoutRelatedTransactionId(t *testing.T) {
	content := "Time,Timezone,Type,Category,Sub Category,Account,Account Currency,Amount,Account2,Account2 Currency,Account2 Amount,Geographic Location,Tags,Description,Transaction Id,Related Transaction Id\n" +
		"2025-01-01 12:34:56,+08:00,Refund,Living,Food,Cash,CNY,50.00,,,,,,,1002,\n"

	_, _, _, _, _, _, err := DefaultTransactionDataCSVFileConverter.ParseImportedData(
		core.NewNullContext(), &models.User{Uid: 123, DefaultCurrency: "CNY"}, []byte(content), time.UTC, converter.DefaultImporterOptions, nil, nil, nil, nil, nil)

	assert.Equal(t, errs.ErrRelatedTransactionNotFound, err)
}

func getDataLineItem(line string, index int) string {
	items := strings.Split(line, ",")

	if index >= len(items) {
		return ""
	}

	return items[index]
}
