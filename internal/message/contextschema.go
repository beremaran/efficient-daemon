package message

// ContextFileSchema is the JSON Schema (draft 2020-12) for the --context file
// format: a single YAML or JSON document with an optional system message and a
// required user message. It mirrors what FromFile accepts, down to
// exactly-one-field parts and non-empty text, so tools that write context
// files can validate against it before handing the file to the CLI. Relative
// media paths resolve against the context file's directory.
const ContextFileSchema = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "efficient-daemon context file",
  "description": "Context for a single LLM request, as one YAML or JSON document. YAML anchors, aliases, and merge keys are accepted. Relative media paths resolve against this file's directory.",
  "type": "object",
  "properties": {
    "system": {
      "$ref": "#/$defs/message",
      "description": "Optional system message setting the model's behavior."
    },
    "user": {
      "$ref": "#/$defs/message",
      "description": "Required user message: the prompt, optionally with attached images or PDFs."
    }
  },
  "required": ["user"],
  "additionalProperties": false,
  "$defs": {
    "message": {
      "description": "A chat message: plain text, or an ordered list of content parts.",
      "oneOf": [
        {
          "type": "string",
          "minLength": 1,
          "description": "Shorthand for a message with a single non-empty text part."
        },
        {
          "type": "object",
          "properties": {
            "parts": {
              "type": "array",
              "minItems": 1,
              "items": {"$ref": "#/$defs/part"},
              "description": "Non-empty ordered list of content parts."
            }
          },
          "required": ["parts"],
          "additionalProperties": false
        }
      ]
    },
    "part": {
      "description": "Exactly one content field per part.",
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "text": {
              "type": "string",
              "minLength": 1,
              "description": "UTF-8 text content."
            }
          },
          "required": ["text"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "image": {
              "type": "string",
              "minLength": 1,
              "description": "Image reference: a local file path (png, jpeg, webp, or gif content, or a PDF rasterized page by page), an http(s) URL with a host, or a data:image/ URL. Local files must be regular and at most 20 MB; PDFs at most 100 pages; remote PDFs are not supported."
            }
          },
          "required": ["image"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "pdf": {
              "type": "string",
              "minLength": 1,
              "description": "Local PDF path; every page is rasterized to an image. At most 100 pages."
            }
          },
          "required": ["pdf"],
          "additionalProperties": false
        }
      ]
    }
  }
}`
