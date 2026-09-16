# Nazar Redaction Schema (PVS)

**Version:** 1.0
**Namespace:** `nazar/pvs-redact/1.0`

## Overview
This schema defines the payload format that leaves the egress gate. It guarantees to the server that specific visual and semantic regions have been deliberately redacted and replaced with tokens or solid-fill mosaics. 

The server must recognize that IDs starting with `PII_` (e.g., `PII_EMAIL_1`) are anonymized placeholders and must not attempt to reconstruct them. When returning an action, the server should return the exact token in the `value` field, which the client's local Vault will resolve.

## Schema Definition

```json
{
  "schema": "nazar/pvs-redact/1.0",
  "viewport": {
    "width": "number",
    "height": "number",
    "dpr": "number"
  },
  "regions": [
    {
      "id": "string",
      "type": "string (e.g., FACE, EMAIL, CC)",
      "bbox": ["x", "y", "width", "height"],
      "method": "string (e.g., mosaic, solid_fill, token_substitute)",
      "confidence": "number (0.0 to 1.0)",
      "node": "string (optional: DOM node ID if applicable)"
    }
  ],
  "semantic_tree": "object (SanitizedDOMContext)",
  "policy": {
    "strict": "boolean",
    "residual_scan_passed": "boolean"
  }
}
```

## Example Payload

```json
{
  "schema": "nazar/pvs-redact/1.0",
  "viewport": {
    "width": 1440,
    "height": 900,
    "dpr": 1
  },
  "regions": [
    {
      "id": "PII_FACE_1",
      "type": "FACE",
      "bbox": [220, 140, 88, 88],
      "method": "mosaic",
      "confidence": 0.97
    },
    {
      "id": "PII_EMAIL_1",
      "type": "EMAIL",
      "node": "el_42",
      "method": "token_substitute",
      "confidence": 0.99
    }
  ],
  "semantic_tree": {
    "elements": [
      {
        "nodeId": "el_42",
        "tagName": "input",
        "text": "<<PII_EMAIL_1>>",
        "bbox": {"x": 200, "y": 300, "width": 150, "height": 30}
      }
    ]
  },
  "policy": {
    "strict": true,
    "residual_scan_passed": true
  }
}
```
