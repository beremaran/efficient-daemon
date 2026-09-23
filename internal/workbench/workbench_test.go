package workbench

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func stubAPI() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("api:" + r.Method + " " + r.URL.Path))
	})
}

func TestIndexServed(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(stubAPI()).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("content-type = %q", ct)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "<script") || !strings.Contains(body, "/assets/") {
		t.Fatalf("index.html does not reference /assets: %s", body)
	}
}

func TestAssetsServed(t *testing.T) {
	// Use one real embedded asset name so the test cannot drift from the build.
	entries, err := distAssets()
	if err != nil || len(entries) == 0 {
		t.Fatalf("no embedded assets: %v", err)
	}
	for _, name := range entries {
		rec := httptest.NewRecorder()
		Handler(stubAPI()).ServeHTTP(rec, httptest.NewRequest("GET", "/assets/"+name, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d", name, rec.Code)
		}
		if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
			t.Errorf("%s: Cache-Control = %q", name, cc)
		}
	}
}

func TestPassthrough(t *testing.T) {
	for _, route := range []struct{ method, path string }{
		{"POST", "/ask"}, {"GET", "/openapi.json"}, {"GET", "/docs"}, {"GET", "/nope"},
	} {
		rec := httptest.NewRecorder()
		Handler(stubAPI()).ServeHTTP(rec, httptest.NewRequest(route.method, route.path, nil))
		if got := rec.Body.String(); got != "api:"+route.method+" "+route.path {
			t.Errorf("%s %s passed through as %q", route.method, route.path, got)
		}
	}
}

func TestIndexNotCached(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(stubAPI()).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "no-cache") {
		t.Fatalf("index Cache-Control = %q", cc)
	}
}

// distAssets lists the files in the embedded assets directory.
func distAssets() ([]string, error) {
	entries, err := files.ReadDir("dist/assets")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}
