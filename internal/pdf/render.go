package pdf

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Render converts every page of path to a PNG and returns the generated paths.
// The caller owns cleanup, which removes the temporary output directory.
func Render(path string) (pages []string, cleanup func(), err error) {
	// Resolve to an absolute path so a relative name like "-foo.pdf" is never
	// parsed as a renderer flag.
	if abs, absErr := filepath.Abs(path); absErr == nil {
		path = abs
	}
	dir, err := os.MkdirTemp("", "efficient-daemon-pdf-*")
	if err != nil {
		return nil, nil, fmt.Errorf("create PDF render directory: %w", err)
	}
	cleanup = func() { _ = os.RemoveAll(dir) }

	var cmd *exec.Cmd
	if binary, lookupErr := exec.LookPath("pdftoppm"); lookupErr == nil {
		cmd = exec.Command(binary, "-png", path, filepath.Join(dir, "page"))
	} else if binary, lookupErr := exec.LookPath("mutool"); lookupErr == nil {
		cmd = exec.Command(binary, "draw", "-o", filepath.Join(dir, "page-%d.png"), path)
	} else {
		cleanup()
		return nil, nil, fmt.Errorf("render PDF: neither pdftoppm nor mutool is installed (install Poppler or MuPDF)")
	}

	if output, runErr := cmd.CombinedOutput(); runErr != nil {
		cleanup()
		return nil, nil, fmt.Errorf("render PDF %q: %w: %s", path, runErr, output)
	}
	pages, err = filepath.Glob(filepath.Join(dir, "*.png"))
	if err != nil || len(pages) == 0 {
		cleanup()
		if err != nil {
			return nil, nil, fmt.Errorf("find rendered PDF pages: %w", err)
		}
		return nil, nil, fmt.Errorf("render PDF %q: renderer produced no pages", path)
	}
	sort.Slice(pages, func(i, j int) bool { return pageNumber(pages[i]) < pageNumber(pages[j]) })
	return pages, cleanup, nil
}

func pageNumber(path string) int {
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	dash := strings.LastIndexByte(name, '-')
	if dash == -1 {
		return 0
	}
	number, _ := strconv.Atoi(name[dash+1:])
	return number
}
