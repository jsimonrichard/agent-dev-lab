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
  "include": ["**/*.ts"]
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
adl workflows list
adl agents list
adl run demo-counter --input '{"steps":3}'
adl run literature-review --input '{"topic":"CRISPR delivery"}'
adl dev
\`\`\`

Runs and chats persist in \`.data/agent-dev-lab.sqlite\`.
`;
