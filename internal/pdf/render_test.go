package pdf

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// makePDF builds a minimal valid PDF with the given number of pages, so tests
// exercise real pdfinfo/pdftoppm behavior without shipping fixtures.
func makePDF(pageCount int) []byte {
	var buf bytes.Buffer
	offsets := make(map[int]int)
	buf.WriteString("%PDF-1.4\n")

	objs := map[int][]byte{}
	kids := ""
	for i := 0; i < pageCount; i++ {
		if i > 0 {
			kids += " "
		}
		kids += fmt.Sprintf("%d 0 R", 3+2*i)
	}
	objs[1] = []byte("<< /Type /Catalog /Pages 2 0 R >>")
	objs[2] = []byte(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", kids, pageCount))
	fontID := 3 + 2*pageCount
	for i := 0; i < pageCount; i++ {
		pageID := 3 + 2*i
		contentID := pageID + 1
		objs[pageID] = []byte(fmt.Sprintf(
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>",
			fontID, contentID))
		stream := fmt.Sprintf("BT /F1 12 Tf 10 30 Td (Page %d) Tj ET", i+1)
		objs[contentID] = []byte(fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream))
	}
	objs[fontID] = []byte("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

	for id := 1; id <= fontID; id++ {
		offsets[id] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n", id)
		buf.Write(objs[id])
		buf.WriteString("\nendobj\n")
	}
	xrefPos := buf.Len()
	size := fontID + 1
	fmt.Fprintf(&buf, "xref\n0 %d\n", size)
	buf.WriteString("0000000000 65535 f \n")
	for id := 1; id < size; id++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[id])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", size, xrefPos)
	return buf.Bytes()
}

func writePDF(t *testing.T, content []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "doc.pdf")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRenderRejectsCorruptPDF(t *testing.T) {
	if _, err := exec.LookPath("pdftoppm"); err != nil {
		t.Skip("pdftoppm not installed")
	}
	pages, cleanup, err := Render(writePDF(t, []byte("%PDF-1.4 corrupt")), 0)
	if err == nil {
		t.Fatal("expected render error")
	}
	if pages != nil {
		t.Fatalf("got %d pages, want nil on failure", len(pages))
	}
	if cleanup != nil {
		t.Fatal("cleanup must be nil on failure")
	}
}

func TestRenderEnforcesPageLimit(t *testing.T) {
	if _, err := exec.LookPath("pdftoppm"); err != nil {
		t.Skip("pdftoppm not installed")
	}
	path := writePDF(t, makePDF(3))

	pages, cleanup, err := Render(path, 2)
	if err == nil || !strings.Contains(err.Error(), "has 3 pages; the maximum is 2") {
		t.Fatalf("got %v, want page-limit error", err)
	}
	if cleanup != nil {
		t.Fatal("cleanup must be nil on failure")
	}

	pages, cleanup, err = Render(path, 3)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	if len(pages) != 3 {
		t.Fatalf("got %d pages, want 3", len(pages))
	}
}

func TestPageCountUsesPDFInfo(t *testing.T) {
	if _, err := exec.LookPath("pdfinfo"); err != nil {
		t.Skip("pdfinfo not installed")
	}
	count, ok := pageCount(context.Background(), writePDF(t, makePDF(3)))
	if !ok || count != 3 {
		t.Fatalf("got (%d, %v), want (3, true)", count, ok)
	}
}

func TestPageNumber(t *testing.T) {
	for name, want := range map[string]int{
		"page-1.png": 1, "page-10.png": 10, "page-007.png": 7, "plain.png": 0,
	} {
		if got := pageNumber(name); got != want {
			t.Errorf("pageNumber(%q) = %d, want %d", name, got, want)
		}
	}
}
