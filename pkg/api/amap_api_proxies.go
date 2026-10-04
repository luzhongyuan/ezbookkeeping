package api

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/settings"
)

const amapCustomMapStylesUrl = "https://webapi.amap.com/v4/map/styles"
const amapOverseasMapUrl = "https://fmap01.amap.com/v3/vectormap"
const amapRestApiUrl = "https://restapi.amap.com/"

// AmapApiProxy represents amap api proxy
type AmapApiProxy struct {
	ApiUsingConfig
}

// Initialize a amap api proxy singleton instance
var (
	AmapApis = &AmapApiProxy{
		ApiUsingConfig: ApiUsingConfig{
			container: settings.Container,
		},
	}
)

// AmapApiProxyHandler returns amap api response
func (p *AmapApiProxy) AmapApiProxyHandler(c *core.WebContext) (*httputil.ReverseProxy, *errs.Error) {
	var targetUrl string
	var applicationKey string
	var stripRequestKey bool

	if strings.HasPrefix(c.Request.RequestURI, "/_AMapService/v4/map/styles") {
		targetUrl = amapCustomMapStylesUrl + strings.TrimPrefix(c.Request.URL.Path, "/_AMapService/v4/map/styles")
	} else if strings.HasPrefix(c.Request.RequestURI, "/_AMapService/v3/vectormap") {
		targetUrl = amapOverseasMapUrl + strings.TrimPrefix(c.Request.URL.Path, "/_AMapService/v3/vectormap")
	} else {
		targetUrl = amapRestApiUrl + strings.TrimPrefix(c.Request.URL.Path, "/_AMapService/")

		// the amap web service apis (such as the place search and the reverse geocoding) only accept the key of
		// "Web Service" platform, while the requests from the amap javascript api use the key of "JavaScript API"
		// platform and must not be replaced, so the web service key is used only when no key is specified
		if isAmapWebServicePath(c.Request.URL.Path) && !c.Request.URL.Query().Has("key") {
			applicationKey = p.CurrentConfig().AmapWebServiceKey
			stripRequestKey = true
		}
	}

	if applicationKey == "" {
		applicationKey = p.CurrentConfig().AmapApplicationKey
	}

	director := func(req *http.Request) {
		query := req.URL.Query()

		if stripRequestKey {
			query.Del("key")
		}

		query.Set("jscode", p.CurrentConfig().AmapApplicationSecret)
		req.URL.RawQuery = query.Encode()

		targetRawUrl := fmt.Sprintf("%s?%s&key=%s", targetUrl, req.URL.RawQuery, applicationKey)
		targetUrl, _ := url.Parse(targetRawUrl)

		oldCookies := req.Cookies()
		req.Header.Del("Cookie")

		for i := 0; i < len(oldCookies); i++ {
			if strings.HasPrefix(oldCookies[i].Name, "ebk_") {
				continue
			}

			req.AddCookie(oldCookies[i])
		}

		req.URL = targetUrl
		req.RequestURI = req.URL.RequestURI()
		req.Host = targetUrl.Host
	}

	return &httputil.ReverseProxy{Director: director}, nil
}

func isAmapWebServicePath(path string) bool {
	return strings.HasPrefix(path, "/_AMapService/v3/place/") || strings.HasPrefix(path, "/_AMapService/v5/place/") ||
		strings.HasPrefix(path, "/_AMapService/v3/geocode/") || strings.HasPrefix(path, "/_AMapService/v5/geocode/")
}
