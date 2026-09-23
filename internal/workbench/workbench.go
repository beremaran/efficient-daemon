// Package workbench serves the embedded workbench UI. Wrap mounts it in front
// of an existing handler: / returns index.html, /assets/* serves the hashed
// build output, everything else passes through untouched.
package workbench

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:dist
var files embed.FS

// Handler serves the UI at / and /assets/*, delegating every other request to
// next. Assets carry immutable cache headers (hashed filenames); index.html is
// always revalidated.
func Handler(next http.Handler) http.Handler {
	root, err := fs.Sub(files, "dist")
	if err != nil {
		// dist is embedded at compile time; a failure here is a build bug.
		panic(err)
	}
	mux := http.NewServeMux()
	mux.Handle("GET /assets/", cacheImmutable(http.FileServerFS(root)))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		index, err := files.ReadFile("dist/index.html")
		if err != nil {
			http.Error(w, "workbench assets not built; run make build-web", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(index)
	})
	mux.Handle("/", next)
	return mux
}

func cacheImmutable(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		next.ServeHTTP(w, r)
	})
}
