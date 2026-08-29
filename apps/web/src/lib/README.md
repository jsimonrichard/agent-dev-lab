# Inspection UI helpers (`src/lib`)

Pure helpers and server modules for the dashboard. Components stay thin; behavior is tested here with `bun test`.

| Folder / file | Role |
| --- | --- |
| `view-model/` | Production UI DTOs (`InspectorMessage`, run projection) — **not** test mocks |
| `event-log/` | Process-wide event log filter, table, SSE server, adapter from core `RunEvent`s |
| `agent/` | Conversation sessions, tools/metadata inspect, URL focus |
| `inspector/` | TanStack server functions, observer attach, inspector types |
| `workflow/` | Waterfall timing, Zod input forms, location helpers |
| Root (`run-service`, `chat-messages`, `sse`, …) | Shared run/chat plumbing not tied to one domain |
