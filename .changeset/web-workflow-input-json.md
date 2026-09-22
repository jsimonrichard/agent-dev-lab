---
"@agent-dev-lab/web": patch
---

Start-workflow input (the dialog, and the workflow page when no run is selected) can edit the entire input object as a document, including raw JSON, not only nested `kind:json` fields. Object field names wrap instead of truncating when defaults are long. The dialog is widened for the editor; the workflow page form uses a wider column.

Schema and JSON parse errors stay hidden until submit or save (start form, tool-context editor, and JSON dialogs). Invalid JSON is left in the field and is not coerced.
