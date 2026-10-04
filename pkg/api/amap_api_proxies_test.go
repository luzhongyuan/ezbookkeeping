package api

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/settings"
)

func TestIsAmapWebServicePath(t *testing.T) {
	assert.True(t, isAmapWebServicePath("/_AMapService/v3/place/text"))
	assert.True(t, isAmapWebServicePath("/_AMapService/v5/place/text"))
	assert.True(t, isAmapWebServicePath("/_AMapService/v3/geocode/regeo"))
	assert.True(t, isAmapWebServicePath("/_AMapService/v5/geocode/regeo"))
	assert.False(t, isAmapWebServicePath("/_AMapService/v4/map/styles"))
	assert.False(t, isAmapWebServicePath("/_AMapService/v3/vectormap"))
}

func TestAmapApiProxyHandler_UsesWebServiceKeyForAmapWebServiceApis(t *testing.T) {
	restoreAmapApiProxyConfig(t, &settings.Config{
		AmapApplicationKey:    "javascript-api-key",
		AmapWebServiceKey:     "web-service-key",
		AmapApplicationSecret: "application-secret",
	})

	requestUris := []string{
		"/_AMapService/v3/place/text?keywords=coffee",
		"/_AMapService/v5/place/text?keywords=coffee",
		"/_AMapService/v3/geocode/regeo?location=121.473701%2C31.230416",
		"/_AMapService/v5/geocode/regeo?location=121.473701%2C31.230416",
	}

	for i := 0; i < len(requestUris); i++ {
		requestUri := requestUris[i]
		proxy, err := AmapApis.AmapApiProxyHandler(createAmapApiProxyWebContext(requestUri))

		assert.Nil(t, err)

		request := httptest.NewRequest("GET", requestUri, nil)
		proxy.Director(request)

		assert.Contains(t, request.URL.String(), "key=web-service-key", requestUri)
		assert.NotContains(t, request.URL.String(), "javascript-api-key", requestUri)
		assert.Contains(t, request.URL.String(), "jscode=application-secret", requestUri)
	}
}

func TestAmapApiProxyHandler_KeepsKeyOfJavascriptApiRequest(t *testing.T) {
	restoreAmapApiProxyConfig(t, &settings.Config{
		AmapApplicationKey:    "javascript-api-key",
		AmapWebServiceKey:     "web-service-key",
		AmapApplicationSecret: "application-secret",
	})

	requestUri := "/_AMapService/v5/place/text?keywords=coffee&key=javascript-api-key"
	proxy, err := AmapApis.AmapApiProxyHandler(createAmapApiProxyWebContext(requestUri))

	assert.Nil(t, err)

	request := httptest.NewRequest("GET", requestUri, nil)
	proxy.Director(request)

	assert.Contains(t, request.URL.String(), "key=javascript-api-key")
	assert.NotContains(t, request.URL.String(), "web-service-key")
}

func TestAmapApiProxyHandler_FallsBackToApplicationKey(t *testing.T) {
	restoreAmapApiProxyConfig(t, &settings.Config{
		AmapApplicationKey:    "javascript-api-key",
		AmapApplicationSecret: "application-secret",
	})

	requestUri := "/_AMapService/v5/place/text?keywords=coffee"
	proxy, err := AmapApis.AmapApiProxyHandler(createAmapApiProxyWebContext(requestUri))

	assert.Nil(t, err)

	request := httptest.NewRequest("GET", requestUri, nil)
	proxy.Director(request)

	assert.Contains(t, request.URL.String(), "key=javascript-api-key")
}

func createAmapApiProxyWebContext(requestUri string) *core.WebContext {
	gin.SetMode(gin.TestMode)

	ginContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	ginContext.Request = httptest.NewRequest("GET", requestUri, nil)

	return &core.WebContext{Context: ginContext}
}

func restoreAmapApiProxyConfig(t *testing.T, config *settings.Config) {
	oldConfig := settings.Container.GetCurrentConfig()
	settings.SetCurrentConfig(config)

	t.Cleanup(func() {
		settings.SetCurrentConfig(oldConfig)
	})
}
