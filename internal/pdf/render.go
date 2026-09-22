package pdf

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// pdfInfoPages matches the "Pages:" line printed by pdfinfo.
var pdfInfoPages = regexp.MustCompile(`(?m)^Pages:\s+(\d+)`)

// renderTimeout bounds external renderer binaries so a pathological PDF cannot
// hang the CLI. It is deliberately independent of --timeout: rendering cost
// depends on the document, not on the model request.
const renderTimeout = 2 * time.Minute

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
	ctx, cancel := context.WithTimeout(context.Background(), renderTimeout)
	defer cancel()
	if maxPages > 0 {
		if count, ok := pageCount(ctx, path); ok && count > maxPages {
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
		cmd = exec.CommandContext(ctx, binary, "-png", path, filepath.Join(dir, "page"))
	} else if binary, lookupErr := exec.LookPath("mutool"); lookupErr == nil {
		cmd = exec.CommandContext(ctx, binary, "draw", "-o", filepath.Join(dir, "page-%d.png"), path)
	} else {
		cleanup()
		return nil, nil, fmt.Errorf("render PDF: neither pdftoppm nor mutool is installed (install Poppler or MuPDF)")
	}

	if output, runErr := cmd.CombinedOutput(); runErr != nil {
		cleanup()
		if ctx.Err() == context.DeadlineExceeded {
			return nil, nil, fmt.Errorf("render PDF %q: timed out after %s", path, renderTimeout)
		}
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
func pageCount(ctx context.Context, path string) (int, bool) {
	binary, err := exec.LookPath("pdfinfo")
	if err != nil {
		return 0, false
	}
	output, err := exec.CommandContext(ctx, binary, path).Output()
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
