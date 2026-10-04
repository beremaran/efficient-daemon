# Workbench UX research

Date: 2026-10-03. Scope: `web/src` at commit 3d3d1b6. I read the source and the Go limits in `internal/server/server.go`. I did not run the app, so each finding comes from code, not from a live test.

The workbench builds an Ask request (see `CONTEXT.md`): settings, system message, parts, schema. It runs `POST /ask`, shows the reply, makes code, and keeps history.

Ranked by impact over effort. Quick wins first.

## 1. Quick wins

### 1.1 Errors and status do not reach screen readers
- Problem: Error boxes, the "Running..." badge, and lint results appear with no live-region role. Screen reader users get no news of a failed run or a bad schema.
- Evidence: `web/src/components/ui/alert.tsx:12-16` (no `role`); `ResponsePanel.tsx:30-31,58-63`; `SchemaPanel.tsx:80-93,154-169`; `App.tsx:311-315`.
- Fix: Add `role="alert"` to the destructive Alert. Wrap the run badge, "linting...", "schema OK" and the issue count in `role="status"`. Keep the element in the page and change its text (MDN says a node made with text already inside may not be announced).
- Sources: WCAG 2.2 SC 4.1.3 Status Messages (https://www.w3.org/TR/WCAG22/#status-messages); MDN `alert` role (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alert_role).

### 1.2 Labels point at invalid ids, and Selects have no link to their label
- Problem: Ids are the label text, such as "Max tokens", "API key", "Base URL". Ids may not hold spaces. The Provider and Reasoning effort `Label` has no `htmlFor`, so the Select trigger has no name.
- Evidence: `fields.tsx:296,301,333,335`; `ConnectionPanel.tsx:380-381`.
- Fix: Use `useId()` for ids. Give each `SelectTrigger` an `id` and the `Label` a matching `htmlFor`. Radix Switch follows the same pattern: its `aria-label="send Temperature"` is fine, but pair it with the visible label.
- Sources: MDN global attribute `id` (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/id); WCAG 2.2 SC 3.3.2 Labels or Instructions; React `useId` (https://react.dev/reference/react/useId).

### 1.3 API key shows in plain text
- Problem: The key field is a normal text input, so it shows on screen and in screen shares. The draft, key included, goes to `localStorage` on every change.
- Evidence: `ConnectionPanel.tsx:434-439` (no `type`); `fields.tsx:336`; `store.ts:373-379`; `ask.ts:33`.
- Fix: Add `type="password"` and `autoComplete="off"`. Drop `apiKey` from the saved draft, or keep it in `sessionStorage`. Say so under the field ("kept for this tab only").
- Sources: MDN `input type=password` (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/password); MDN `localStorage` (data persists with no expiry, stored as plain strings, https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

### 1.4 Copy buttons give no answer, and fail on plain HTTP
- Problem: "Copy response" and history "Copy" ignore the result of `copyText`. `navigator.clipboard` works only in secure contexts, so it fails when users open the Docker build over `http://<host>:8080`. The user sees nothing.
- Evidence: `ResponsePanel.tsx:51-55`; `HistoryPanel.tsx:223`; `store.ts:436-443`. Only the Codegen button shows "Copied!" (`CodegenPanel.tsx:51-56,72`), and it stays silent on failure.
- Fix: One `CopyButton` that shows "Copied" or "Copy failed - select the text and press Ctrl+C", in a `role="status"` span. Fall back to selecting the text in the editor.
- Source: MDN `Clipboard.writeText` (secure context only, may throw `NotAllowedError`, https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).

### 1.5 `alert()` for oversize files
- Problem: A blocking browser dialog, outside the page's style, with no link to the part that failed.
- Evidence: `PartsEditor.tsx:716-719`.
- Fix: Show an inline error under that part's file button (`role="alert"`). Catch `fileToBase64` failure too; today a read error is an unhandled rejection (`PartsEditor.tsx:721`).
- Sources: WCAG 2.2 SC 3.3.1 Error Identification and 3.3.3 Error Suggestion (https://www.w3.org/TR/WCAG22/#error-identification).

### 1.6 Run is disabled with no reason
- Problem: When `canRun` is false the button is dim and the user must guess why (no model, no base URL, empty parts, bad schema). Only schema errors get a message.
- Evidence: `App.tsx:98-107,311-325`.
- Fix: Compute a list of reasons, show the first next to the button ("Add a base URL in Connection & sampling"), and set it as `aria-describedby`. Open the Connection card on its own when model or base URL is missing.
- Sources: WCAG 2.2 SC 3.3.3 Error Suggestion; SC 3.3.2 Labels or Instructions (https://www.w3.org/TR/WCAG22/).

### 1.7 No keyboard shortcut to run
- Problem: Users type in a text part or in the schema, then must reach for the mouse or tab far to Run.
- Evidence: `App.tsx:188-196` (no key handler).
- Fix: Add Ctrl/Cmd+Enter on `window` that calls `runRequest` when `canRun`. Show the hint in the button ("Run  Ctrl+Enter"). CodeMirror needs the same chord in its keymap, since it takes key events first.
- Source: WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard).

## 2. Medium effort

### 2.1 Cancelled, failed and empty states lose the request
- Problem: Stop sets `IDLE_STATE`, which wipes status and response. Stopped runs do not enter history. A failed run leaves the Response editor with the placeholder comment. Fetch errors say only "Failed to fetch".
- Evidence: `App.tsx:156-160,161-180`; `ResponsePanel.tsx:76`.
- Fix: On Stop, keep the last response and show "Stopped after N s". Map network failures to a clear line ("Cannot reach the workbench server"). Show an empty state with the steps (add text, check schema, Run) instead of a code comment. Show elapsed time while running.
- Sources: WCAG 2.2 SC 3.3.3; SC 4.1.3 (https://www.w3.org/TR/WCAG22/).

### 2.2 Response is hard to read and use
- Problem: The reply is JSON text in a dark editor, even for success. There is no format toggle, no download, and the Response tab always opens first, even when the user came from History. The page theme is light, the editors are dark (`oneDark`), so the screen has two themes.
- Evidence: `ResponsePanel.tsx:75-82`, `SchemaPanel.tsx:102`, `CodegenPanel.tsx:82`; `index.css:1-30` (no dark tokens in use).
- Fix: Pretty-print valid JSON. Add "Download .json". Pick the CodeMirror theme from `prefers-color-scheme`, and add a matching dark token set (`@custom-variant dark` exists but nothing sets `.dark`). Check the light-theme status badges against 4.5:1 (`text-emerald-700` on `bg-emerald-50` and the muted gray `--muted-foreground` at `index.css:15`).
- Sources: WCAG 2.2 SC 1.4.3 Contrast (Minimum) (https://www.w3.org/TR/WCAG22/#contrast-minimum); MDN `prefers-color-scheme` (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme).

### 2.3 Drag and drop for files, and a real file name for PDFs
- Problem: Adding an image or PDF takes Choose file only. A new Image part starts in URL mode, so an upload needs a switch flip first. A switch that reads "Upload [x] http(s) URL" is hard to read: the labels sit on both sides of one control.
- Evidence: `PartsEditor.tsx:520,648-656,726-731`.
- Fix: Make the image part a two-option tab or radio group ("Upload" / "URL"). Accept dropped files on the part card, and paste from the clipboard into an image part. Call `preventDefault` on `dragover` and `drop`, and read `dataTransfer.files`.
- Source: MDN `drop` event (https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/drop_event); WAI-ARIA APG Tabs / Radio patterns (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

### 2.4 Part list keys and movement
- Problem: Parts use the array index as key, so moving or deleting a part leaves the wrong text-area state and focus. After remove, focus drops to the page. New parts do not get focus. Reorder buttons have no text, only `aria-label` in lower case.
- Evidence: `PartsEditor.tsx:537-545,611-619`.
- Fix: Give each part a stable `id` (store it in the Draft). After add, focus the new field. After remove, focus the next part or the add buttons. Label buttons "Move part 2 up", "Remove part 2". Confirm removal of an uploaded file, or offer Undo.
- Source: WCAG 2.2 SC 2.4.3 Focus Order (https://www.w3.org/TR/WCAG22/#focus-order); React list keys (https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key).

### 2.5 Hidden settings cause blind runs
- Problem: Connection, the one card that must be right before Run works, starts closed. The system message card is also closed with no sign that it holds text. Each `summary` is a plain styled element with no focus ring.
- Evidence: `App.tsx:200-214,219-235`; summary classes at `:201,:220`.
- Fix: Open Connection by default until model and base URL resolve. Show a one-line summary in the closed header (model, provider, "system message set"). Add `focus-visible:ring` to `summary`.
- Sources: MDN `<details>` (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details); WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible).

### 2.6 Layout on small screens and tall panes
- Problem: Below `lg` the page is one column: the response sits under four long cards and the user must scroll past them after Run. The schema editor is fixed at 300 px. The Response card has no scroll cue.
- Evidence: `App.tsx:197-198,266`; `SchemaPanel.tsx:98-100`.
- Fix: After Run, scroll the response into view on narrow screens (or show tabs: Request / Response). Let the schema editor grow with its pane.
- Source: MDN `Element.scrollIntoView` (https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView).

### 2.7 History
- Problem: Rows show time and an excerpt only; no model, no first words of the input, no search. Restore replaces the whole draft at once with no undo, and History uses `at` as key. Writes to `localStorage` with base64 parts can hit the quota, and then the code removes all history without telling the user.
- Evidence: `HistoryPanel.tsx:199,206-240`; `App.tsx:186`; `store.ts:397-411`; `RunRecord.model` stored but not shown.
- Fix: Show model and a short prompt label. Keep media out of stored history (store file names only). Confirm Restore if the draft has changed, or offer Undo. Tell the user when persistence fails.
- Source: MDN `localStorage` (quota and `SecurityError` exceptions, https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

## 3. Larger work

### 3.1 Inline validation next to the field
- Problem: Errors from lint (a schema problem, a bad number) show only below the schema or in the header. Temperature `max=2`, Max tokens and Max score levels take any text; a bad value fails only at Run.
- Evidence: `ConnectionPanel.tsx:463-479`; `App.tsx:89-91`; `fields.tsx:299-309`.
- Fix: Mark bad fields with `aria-invalid` and tie a message through `aria-describedby`. Link the header count to the schema card ("2 schema issues - Go to schema").
- Source: WCAG 2.2 Understanding 3.3.1 (https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).

### 3.2 Lint state flickers and Run lags behind typing
- Problem: `linting` hides the old result while a new check runs (`App.tsx:94`), so the error count and the badge blink on each pause in typing, and Run enables for a moment on a bad schema (`lintErrors` is empty while `linting`).
- Evidence: `App.tsx:56-59,79-94,98-103`.
- Fix: Keep the last result visible and mark it stale. Disable Run while `linting` is true. Consider `useDeferredValue` for the request build so typing in a big text part stays smooth (the request is rebuilt, and JSON-stringified, on each key press: `App.tsx:51-54`).
- Source: React `useDeferredValue` (https://react.dev/reference/react/useDeferredValue).

### 3.3 Tabs: keyboard and focus detail
- Problem: Tabs inside tabs (Response / Codegen / History, then Response / Answers / Request body, then Edit / Generate) with the same look. Radix provides the roles and arrow keys, but panels with no focusable child need `tabIndex=0`. The CodeMirror editors take Tab for focus and may trap keyboard users.
- Evidence: `App.tsx:267-286`; `ResponsePanel.tsx:67-72`; `ui/tabs.tsx:29` (`focus-visible:outline-none` on content).
- Fix: Make the nested tab sets look different, or turn "Request body" into a plain toggle. Add a visible hint for leaving CodeMirror with Esc then Tab, or set `indentWithTab` off for read-only editors.
- Source: WAI-ARIA APG Tabs pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/); WCAG 2.2 SC 2.1.2 No Keyboard Trap (https://www.w3.org/TR/WCAG22/#no-keyboard-trap).

### 3.4 Tap size and icon-only buttons
- Problem: Small ghost buttons and `size="icon"` buttons may be under 24 px. The `h-4 w-4` chevron is not a target, but the reorder buttons are.
- Evidence: `ui/button.tsx` sizes; `PartsEditor.tsx:611-619`; `HistoryPanel.tsx:223-228`.
- Fix: Check each size variant is at least 24x24 CSS px (prefer 32). Add tooltips (Radix Tooltip is already a dependency but unused in these buttons).
- Source: WCAG 2.2 SC 2.5.8 Target Size (Minimum) (https://www.w3.org/TR/WCAG22/#target-size-minimum).

### 3.5 Copy: wording
- Problem: Terms drift from `CONTEXT.md`. The UI says "Request body" (Avoid list) and "payload"; the glossary says "Ask request". "User message parts" has a "Part" glossary entry. The Codegen note says "elided"; "Copy (full, untruncated)" is long. The "same engine as transform.tools" line names a site users may not know.
- Evidence: `ResponsePanel.tsx:71`; `PartsEditor.tsx:578`; `App.tsx:240`; `CodegenPanel.tsx:72,75-77`; `SchemaPanel.tsx:112-113`.
- Fix: Use "Ask request" for the tab, "Message parts" for the card, "Copy full snippet". Cut the transform.tools mention or move it to a title.
- Source: project glossary, `CONTEXT.md` (Ask request, Part; "Avoid" lists).

## Not covered
I did not run the app, test with a screen reader, or measure real contrast. Check 1.1, 2.2 and 3.4 in a browser before change. The `web/AGENTS.md` skills (`web-design-guidelines`, `vercel-react-best-practices`) were not installed here, so I did not apply them.

Source check: I fetched and read the WCAG 2.2 text (SC 4.1.3, 3.3.1, 3.3.2, 3.3.3, 2.1.1, 2.5.8, 1.4.3), the Understanding 3.3.1 page, MDN (alert role, input password, localStorage, writeText, drop event, details, id), the APG Tabs page and the React `useDeferredValue` page. I cited these without fetching them: WCAG SC 2.4.3, 2.4.7 and 2.1.2, React `useId` and list keys, MDN `scrollIntoView` and `prefers-color-scheme`. Check those before you rely on them.
