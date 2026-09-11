---
"@agent-dev-lab/cli": patch
---

`adl init` does not create a VCS repository. Git is opt-in via `--git` (`git init` in the new project; refused if the directory is already inside a Git work tree). `.gitignore` is still written so jj and a later `git init` have ignore rules.
