/** Standalone tsconfig for `adl init` projects. Playground extends the monorepo shared config. */
export const INIT_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun"],
    "paths": {
      "#adl": ["./src/adl.ts"]
    }
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
`;

export const INIT_README = `# {{DISPLAY_NAME}}

ADL project scaffolded by \`adl init\`.

## Setup

\`\`\`bash
bun install
\`\`\`

Add provider keys to \`.env\` at the project root (loaded automatically, like Next.js):

\`\`\`bash
OPENAI_API_KEY=sk-...
\`\`\`

Optional: \`ADL_MODEL\` (default \`gpt-4o-mini\`), \`ADL_SQLITE_PATH\` (default \`.data/agent-dev-lab.sqlite\`).

## Commands

\`\`\`bash
bun run dev
bun run dashboard
adl workflow list
adl agent list
adl workflow run demo-counter --input '{"steps":3}'
adl workflow run ask --input '{"question":"What is Agent Dev Lab?"}'
\`\`\`

Runs and chats persist in \`.data/agent-dev-lab.sqlite\`.
`;
