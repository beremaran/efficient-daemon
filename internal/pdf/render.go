package pdf

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// pdfInfoPages matches the "Pages:" line printed by pdfinfo.
var pdfInfoPages = regexp.MustCompile(`(?m)^Pages:\s+(\d+)`)

// Render converts every page of path to a PNG and returns the generated paths.
// If maxPages is positive, a PDF with more pages fails before rendering when
// pdfinfo is available, and after rendering otherwise. The caller owns cleanup,
// which removes the temporary output directory.
func Render(path string, maxPages int) (pages []string, cleanup func(), err error) {
	// Resolve to an absolute path so a relative name like "-foo.pdf" is never
	// parsed as a renderer flag.
	if abs, absErr := filepath.Abs(path); absErr == nil {
		path = abs
	}
	if maxPages > 0 {
		if count, ok := pageCount(path); ok && count > maxPages {
			return nil, nil, tooManyPages(path, count, maxPages)
		}
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
	if maxPages > 0 && len(pages) > maxPages {
		cleanup()
		return nil, nil, tooManyPages(path, len(pages), maxPages)
	}
	sort.Slice(pages, func(i, j int) bool { return pageNumber(pages[i]) < pageNumber(pages[j]) })
	return pages, cleanup, nil
}

// pageCount reports the page count using pdfinfo (installed alongside
// pdftoppm by Poppler). The second result is false when pdfinfo is missing or
// does not understand the file; callers then fall back to counting rendered
// pages.
func pageCount(path string) (int, bool) {
	binary, err := exec.LookPath("pdfinfo")
	if err != nil {
		return 0, false
	}
	output, err := exec.Command(binary, path).Output()
	if err != nil {
		return 0, false
	}
	match := pdfInfoPages.FindSubmatch(output)
	if match == nil {
		return 0, false
	}
	count, convErr := strconv.Atoi(string(match[1]))
	if convErr != nil {
		return 0, false
	}
	return count, true
}

func tooManyPages(path string, count, max int) error {
	return fmt.Errorf("PDF %q has %d pages; the maximum is %d (split the document)", path, count, max)
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
