import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createRuntimeShell } from '@agent-dev-lab/runtime'

export const Route = createFileRoute('/api/runtime')({
  server: {
    handlers: {
      GET: () => json(createRuntimeShell()),
    },
  },
})
