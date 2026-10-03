# efficient-daemon

A CLI and HTTP daemon that asks a model for an answer shaped by a JSON Schema. The workbench is a browser UI for building and trying those asks.

## Language

**Ask request**:
The body sent to `POST /ask`: schema, parts, optional system message, and provider settings. Every workbench view of a request (Run, codegen, lint, payload size) derives from one Ask request.
_Avoid_: payload, request body

**Draft**:
The workbench's editable state: settings, system message, parts, and schema text. A Draft holds UI-only facts (file names, upload or URL source) that the Ask request drops.
_Avoid_: form, session

**Part**:
One piece of the user message: text, an image, or a PDF.
_Avoid_: attachment, message item
