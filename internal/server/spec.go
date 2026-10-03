package server

import (
	"encoding/json"
	"fmt"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/invopop/jsonschema"
)

// buildSpec assembles the OpenAPI document from the handler's request types.
// There is no spec file to maintain: the schema for POST /ask is reflected
// from AskRequest, so the document cannot drift from the handler.
func buildSpec(version string) ([]byte, error) {
	reflected := (&jsonschema.Reflector{DoNotReference: true, Anonymous: true}).Reflect(&AskRequest{})
	// json.RawMessage reflects as "any"; document the field properly.
	reflected.Properties.Set("schema", &jsonschema.Schema{
		Type:        "object",
		Description: "JSON Schema the model response must satisfy (strict structured-output subset).",
	})
	// JSON Schema dialect markers are not valid OpenAPI 3.0 document fields.
	reflected.Version = ""
	reflected.ID = ""
	raw, err := json.Marshal(reflected)
	if err != nil {
		return nil, fmt.Errorf("encode reflected request schema: %w", err)
	}
	var requestSchema openapi3.Schema
	if err := requestSchema.UnmarshalJSON(raw); err != nil {
		return nil, fmt.Errorf("decode reflected request schema: %w", err)
	}

	stringType := &openapi3.Types{"string"}
	objectType := &openapi3.Types{"object"}
	errorSchema := &openapi3.Schema{
		Type: objectType,
		Properties: openapi3.Schemas{
			"error": openapi3.NewSchemaRef("", &openapi3.Schema{Type: stringType}),
		},
		Required: []string{"error"},
	}
	outputSchema := &openapi3.Schema{
		Description: "Validated model output; the shape is defined by the request's schema.",
	}
	jsonResponse := func(status, description string, schema *openapi3.Schema) openapi3.NewResponsesOption {
		return openapi3.WithName(status, openapi3.NewResponse().
			WithDescription(description).
			WithContent(openapi3.NewContentWithJSONSchema(schema)))
	}
	responses := openapi3.NewResponses(
		jsonResponse("200", "Model output, validated against the request's schema. A jevjam request with answers: true gets {result, answers} instead, where answers holds jevjam's raw answers.", outputSchema),
		jsonResponse("400", "Invalid request body or media.", errorSchema),
		jsonResponse("422", "Model output failed schema validation.", errorSchema),
		jsonResponse("502", "Upstream LLM error.", errorSchema),
		jsonResponse("504", "Upstream LLM request timed out.", errorSchema),
	)

	post := &openapi3.Operation{
		OperationID: "ask",
		Summary:     "Run one structured-output completion",
		Description: "Synchronous: returns once the model responded and the output passed schema validation.",
		RequestBody: &openapi3.RequestBodyRef{Value: &openapi3.RequestBody{
			Required: true,
			Content: openapi3.NewContentWithJSONSchemaRef(
				openapi3.NewSchemaRef("#/components/schemas/AskRequest", nil)),
		}},
		Responses: responses,
	}
	doc := &openapi3.T{
		OpenAPI: "3.0.3",
		Info: &openapi3.Info{
			Title:       "efficient-daemon API",
			Description: "Structured-output LLM requests. This document is generated at startup from the server's request types.",
			Version:     version,
		},
		Paths: openapi3.NewPaths(openapi3.WithPath("/ask", &openapi3.PathItem{Post: post})),
		Components: &openapi3.Components{Schemas: openapi3.Schemas{
			"AskRequest": openapi3.NewSchemaRef("", &requestSchema),
		}},
	}
	return doc.MarshalJSON()
}

// docsHTML is the /docs page: Scalar from a pinned CDN, pointed at
// /openapi.json.
const docsHTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>efficient-daemon API reference</title>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.71.0"></script>
</head>
<body>
<script id="app" data-url="/openapi.json"></script>
</body>
</html>
`
