#!/usr/bin/env bash
# Quality gate. Run by Claude Code and Cursor hooks; also runnable by hand.
#
#   .claude/gate.sh fast            the quick checks
#   .claude/gate.sh full            everything the push gate runs
#   .claude/gate.sh full -v         stream every command's output live
#   .claude/gate.sh full --event=<claude-pretooluse|claude-stop|cursor-shell|cursor-stop>
#
# Scaffold: ~/.local/share/orch/pack/gate/gate.sh
# This copy keeps the repo's run_checks (no GATE_UNCONFIGURED) and prepends
# bun/mise dirs because Cursor hooks are non-interactive and skip ~/.bashrc.
#
# CLAUDE_GATE_VERBOSE=1 is equivalent to -v. Progress goes to stdout when run by
# hand and to stderr under a hook, where stdout is parsed as JSON.
#
# Wiring: .claude/settings.json (Claude Code), .cursor/hooks.json (Cursor).
# Works under git and Jujutsu (jj), colocated or not; jj wins when both are
# present, matching vcs_kind_at() in tsk-core.
#
# Escape hatch for a failure you have knowingly accepted, with the user's
# agreement:  CLAUDE_GATE_SKIP=1 <your push command>
set -uo pipefail

MODE="${1:-full}"
EVENT="cli"
VERBOSE="${CLAUDE_GATE_VERBOSE:-0}"
for a in "$@"; do
  case "$a" in
    --event=*)      EVENT="${a#--event=}" ;;
    -v|--verbose)   VERBOSE=1 ;;
  esac
done

is_hook=1; case "$EVENT" in cli) is_hook=0 ;; esac

# Cursor/Claude hooks skip interactive bashrc, so bun/jj are often missing.
prepend_dir() {
  local d="$1"
  [ -d "$d" ] || return 0
  case ":$PATH:" in
    *":$d:"*) ;;
    *) PATH="$d:$PATH" ;;
  esac
}
prepend_dir "${HOME:-}/.local/share/mise/shims"
prepend_dir "${HOME:-}/.bun/bin"
prepend_dir "${HOME:-}/.cache/.bun/bin"
prepend_dir "${HOME:-}/.local/bin"
prepend_dir "${HOME:-}/.cargo/bin"
export PATH

# Cursor beforeShellExecution + failClosed requires JSON on stdout.
cursor_shell_allow() {
  [ "$EVENT" = "cursor-shell" ] && printf '%s\n' '{"permission":"allow"}'
}

say()   { if [ "$is_hook" = 1 ]; then printf '%s\n' "$*" >&2; else printf '%s\n' "$*"; fi; }
say_n() { if [ "$is_hook" = 1 ]; then printf '%s'   "$*" >&2; else printf '%s'   "$*"; fi; }

GATE_STEP=0
GATE_FAIL_LABEL=""
GATE_FAIL_OUT=""
step() {
  local label="$1"; shift
  GATE_STEP=$((GATE_STEP + 1))
  local t0=$SECONDS rc=0 out="" log
  if [ "$VERBOSE" = 1 ]; then
    say ""
    say "──── [$GATE_STEP] $label"
    log="$(mktemp)"
    if [ "$is_hook" = 1 ]; then "$@" 2>&1 | tee -a "$log" >&2; rc=${PIPESTATUS[0]}
    else                        "$@" 2>&1 | tee -a "$log";     rc=${PIPESTATUS[0]}; fi
    out="$(cat "$log" 2>/dev/null)"; rm -f "$log"
    say_n "──── [$GATE_STEP] $label "
  else
    say_n "  [$GATE_STEP] $label ... "
    out="$("$@" 2>&1)" || rc=$?
  fi
  local d=$((SECONDS - t0))
  if [ "$rc" -eq 0 ]; then
    say "ok (${d}s)"
  else
    say "FAILED (${d}s)"
    [ -z "$GATE_FAIL_LABEL" ] && { GATE_FAIL_LABEL="$label"; GATE_FAIL_OUT="$out"; }
  fi
  return "$rc"
}

fail() {
  local reason="$1"
  case "$EVENT" in
    claude-pretooluse)
      jq -nc --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
      exit 0 ;;
    claude-stop)
      jq -nc --arg r "$reason" '{decision:"block",reason:$r}'
      exit 0 ;;
    cursor-shell|cursor-stop)
      printf '%s\n' "$reason" >&2; exit 2 ;;
    *)
      printf '%s\n' "$reason" >&2; exit 1 ;;
  esac
}

case "$EVENT" in
  claude-pretooluse|cursor-shell)
    STDIN_JSON="$(timeout 2 cat 2>/dev/null || true)"
    case "$EVENT" in
      claude-pretooluse) CMD="$(printf '%s' "$STDIN_JSON" | jq -r '.tool_input.command // ""' 2>/dev/null)" ;;
      cursor-shell)      CMD="$(printf '%s' "$STDIN_JSON" | jq -r '.command // ""' 2>/dev/null)" ;;
    esac
    if ! printf '%s' "$CMD" | grep -Eq \
      -e '(^|[;&|])[[:space:]]*git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)' \
      -e '(^|[;&|])[[:space:]]*jj([[:space:]]+-[^[:space:]]+)*[[:space:]]+git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)'; then
      cursor_shell_allow
      exit 0
    fi
    ;;
esac

if [ -n "${CLAUDE_GATE_SKIP:-}" ]; then
  [ "$is_hook" = 0 ] && echo "gate: skipped (CLAUDE_GATE_SKIP set)"
  cursor_shell_allow
  exit 0
fi

VCS=""; ROOT=""
if command -v jj >/dev/null 2>&1 && R="$(jj root 2>/dev/null)" && [ -d "$R/.jj" ]; then
  VCS=jj; ROOT="$R"
elif R="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$R" ]; then
  VCS=git; ROOT="$R"
else
  case "$EVENT" in
    claude-pretooluse|cursor-shell)
      fail "Gate could not run: no git or jj repository found here, so nothing was verified." ;;
    *) exit 0 ;;
  esac
fi
cd "$ROOT" 2>/dev/null || fail "Gate could not run: cannot enter repo root $ROOT."

case "$VCS" in
  jj)
    STATE_DIR="$ROOT/.jj"
    state_hash() { jj log -r @ --no-graph -T 'commit_id' 2>/dev/null; }
    has_pending() { [ "$(jj log -r @ --no-graph -T 'if(empty,"empty","dirty")' 2>/dev/null)" = dirty ]; }
    ;;
  git)
    STATE_DIR="$ROOT/.git"
    state_hash() {
      { git rev-parse HEAD 2>/dev/null || echo nohead
        git status --porcelain=v1 2>/dev/null
        git diff HEAD 2>/dev/null
      } | sha256sum | cut -d' ' -f1
    }
    has_pending() { [ -n "$(git status --porcelain 2>/dev/null)" ]; }
    ;;
esac
SENTINEL="$STATE_DIR/claude-gate-state"

case "$EVENT" in
  claude-stop|cursor-stop)
    has_pending || exit 0
    NOW="$(state_hash)"
    if [ -n "$NOW" ] && [ -f "$SENTINEL" ] && [ "$(cat "$SENTINEL" 2>/dev/null)" = "$NOW" ]; then
      exit 0
    fi
    ;;
esac

preflight() {
  [ -d node_modules ] || { echo "dependencies are not installed - run 'bun install' in the repo root."; return 1; }
  command -v bun >/dev/null 2>&1 || {
    echo "bun is not on PATH. Install bun, or put it on PATH (Cursor hooks do not load interactive bashrc)."
    return 1
  }
}
run_checks() {
  step "format:check" bun run format:check || return 1
  step "lint"         bun run lint         || return 1
  step "typecheck"    bun run typecheck    || return 1
  [ "$MODE" = "full" ] || return 0
  step "test"         bun run test         || return 1
  # Node is the reference runtime for packages/tools' process/spawn-level code, so
  # CI runs this too; keep the gate in step or the gate can pass where CI fails.
  step "test:node"    bun run test:node    || return 1
  step "build"        bun run build        || return 1
}

if declare -F preflight >/dev/null 2>&1; then
  PRE="$(preflight 2>&1)"; PRC=$?
  [ "$PRC" -ne 0 ] && fail "Gate could not run, so nothing was verified: $PRE"
fi

GATE_T0=$SECONDS
say "gate: running $MODE checks in $(basename "$ROOT") ($VCS)$([ "$VERBOSE" = 1 ] && echo ' [verbose]')"
[ "$VERBOSE" = 1 ] || [ "$is_hook" = 1 ] || say "      (add -v to stream each command's output)"

run_checks; RC=$?

case "$EVENT" in
  claude-stop|cursor-stop) state_hash > "$SENTINEL" 2>/dev/null || true ;;
esac

GATE_ELAPSED=$((SECONDS - GATE_T0))
if [ "$RC" -eq 0 ]; then
  say "gate: $MODE checks passed in ${GATE_ELAPSED}s"
  cursor_shell_allow
  exit 0
fi
say "gate: $MODE checks FAILED after ${GATE_ELAPSED}s"

if [ -n "$GATE_FAIL_LABEL" ]; then
  DETAIL="Failing step: $GATE_FAIL_LABEL

$(printf '%s' "$GATE_FAIL_OUT" | tail -n 40 | tail -c 3000)"
else
  DETAIL="run_checks failed without using step(); no output captured. Re-run with: .claude/gate.sh $MODE -v"
fi
case "$EVENT" in
  claude-pretooluse|cursor-shell)
    fail "Push blocked: this repo's full quality gate failed. Fix these, then push again.
Re-run yourself with: .claude/gate.sh full
If the failure is pre-existing or knowingly accepted, ask the user before overriding with CLAUDE_GATE_SKIP=1.

$DETAIL" ;;
  *)
    fail "This repo's fast checks are failing on your pending changes. Fix them before finishing.
Re-run yourself with: .claude/gate.sh fast

$DETAIL" ;;
esac
