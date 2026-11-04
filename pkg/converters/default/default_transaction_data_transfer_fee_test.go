package _default

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/converters/converter"
	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/models"
	"github.com/mayswind/ezbookkeeping/pkg/utils"
)

func createTransferFeeTestData() (*models.Transaction, map[int64]*models.Account, map[int64]*models.TransactionCategory) {
	transferTransaction := &models.Transaction{
		TransactionId:        1001,
		Uid:                  123,
		Type:                 models.TRANSACTION_DB_TYPE_TRANSFER_OUT,
		CategoryId:           10,
		TransactionTime:      utils.GetMinTransactionTimeFromUnixTime(1735689600),
		Amount:               100000,
		AccountId:            5,
		RelatedId:            1002,
		RelatedAccountId:     6,
		RelatedAccountAmount: 99000,
		FeeCategoryId:        7,
	}

	accountMap := map[int64]*models.Account{
		5: {AccountId: 5, Name: "Cash", Currency: "CNY"},
		6: {AccountId: 6, Name: "Bank", Currency: "CNY"},
	}

	categoryMap := map[int64]*models.TransactionCategory{
		6:  {CategoryId: 6, Name: "Living", Type: models.CATEGORY_TYPE_EXPENSE, ParentCategoryId: -1},
		7:  {CategoryId: 7, Name: "Food", Type: models.CATEGORY_TYPE_EXPENSE, ParentCategoryId: 6},
		10: {CategoryId: 10, Name: "Transfer", Type: models.CATEGORY_TYPE_TRANSFER, ParentCategoryId: -1},
	}

	return transferTransaction, accountMap, categoryMap
}

func TestDefaultTransactionDataCSVFileConverterExportTransferFeeTransaction(t *testing.T) {
	transferTransaction, accountMap, categoryMap := createTransferFeeTestData()

	content, err := DefaultTransactionDataCSVFileConverter.ToExportedContent(core.NewNullContext(), 123,
		[]*models.Transaction{transferTransaction}, accountMap, categoryMap, map[int64]*models.TransactionTag{}, map[int64][]int64{})

	assert.Nil(t, err)

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	assert.Equal(t, 2, len(lines))
	assert.Equal(t, "Fee Category", getDataLineItem(lines[0], 14))
	assert.Equal(t, "Fee Sub Category", getDataLineItem(lines[0], 15))
	assert.Equal(t, "Living", getDataLineItem(lines[1], 14))
	assert.Equal(t, "Food", getDataLineItem(lines[1], 15))
}

func TestDefaultTransactionDataCSVFileConverterExportTransferTransactionWithoutFee(t *testing.T) {
	transferTransaction, accountMap, categoryMap := createTransferFeeTestData()
	transferTransaction.FeeCategoryId = 0
	transferTransaction.RelatedAccountAmount = transferTransaction.Amount

	content, err := DefaultTransactionDataCSVFileConverter.ToExportedContent(core.NewNullContext(), 123,
		[]*models.Transaction{transferTransaction}, accountMap, categoryMap, map[int64]*models.TransactionTag{}, map[int64][]int64{})

	assert.Nil(t, err)

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	assert.Equal(t, 2, len(lines))
	assert.Equal(t, 14, len(strings.Split(lines[0], ",")), "the transfer fee columns should be exported only when there are transfer fee transactions")
}

func TestDefaultTransactionDataCSVFileConverterParseTransferFeeTransaction(t *testing.T) {
	transferTransaction, accountMap, categoryMap := createTransferFeeTestData()

	content, err := DefaultTransactionDataCSVFileConverter.ToExportedContent(core.NewNullContext(), 123,
		[]*models.Transaction{transferTransaction}, accountMap, categoryMap, map[int64]*models.TransactionTag{}, map[int64][]int64{})

	assert.Nil(t, err)

	user := &models.User{
		Uid:             123,
		DefaultCurrency: "CNY",
	}

	parsedTransactions, _, newExpenseCategories, _, _, _, err := DefaultTransactionDataCSVFileConverter.ParseImportedData(
		core.NewNullContext(), user, content, time.UTC, converter.DefaultImporterOptions,
		map[string]*models.Account{"Cash": accountMap[5], "Bank": accountMap[6]},
		map[string]map[string]*models.TransactionCategory{"Food": {"Living": categoryMap[7]}},
		map[string]map[string]*models.TransactionCategory{},
		map[string]map[string]*models.TransactionCategory{"Transfer": {"Transfer": categoryMap[10]}},
		map[string]*models.TransactionTag{})

	assert.Nil(t, err)
	assert.Equal(t, 1, len(parsedTransactions))
	assert.Equal(t, 0, len(newExpenseCategories), "the fee category already exists")

	parsedTransaction := parsedTransactions[0]

	assert.Equal(t, models.TRANSACTION_DB_TYPE_TRANSFER_OUT, parsedTransaction.Type)
	assert.Equal(t, int64(100000), parsedTransaction.Amount)
	assert.Equal(t, int64(99000), parsedTransaction.RelatedAccountAmount)
	assert.Equal(t, int64(7), parsedTransaction.FeeCategoryId)
	assert.Equal(t, "Food", parsedTransaction.OriginalFeeCategoryName)
}
