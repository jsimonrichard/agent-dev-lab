#!/usr/bin/env sh
# Run when a task is created or restored from archive.
#
# tsk picks a monitor that does not host a global workspace (e.g. workspace "1"
# stays on its current monitor) and sets TSK_ON_START_MONITOR before running
# this script. Override with on_start_monitor in .tsk/repo.toml if needed.
# TSK_TASK_HOOK is "create" or "restore" if you need different behavior.
# When container isolation is enabled, TSK_CONTAINER_ISOLATION=1 and
# TSK_CONTAINER_NAME are set — launch Cursor via Distrobox so it runs in the
# task container. `--classic` opens the editor window, not Agents.
if [ -n "$TSK_PRIMARY_NON_GLOBAL_WORKSPACE" ] && [ -n "$TSK_ON_START_MONITOR" ] && command -v hyprctl >/dev/null 2>&1; then
  # Hyprland 0.55+ Lua: legacy `dispatch workspace name:…` is a syntax error.
  hyprctl dispatch "hl.dsp.focus({ monitor = \"$TSK_ON_START_MONITOR\" })" >/dev/null 2>&1 || true
  hyprctl dispatch "hl.dsp.focus({ workspace = \"name:$TSK_PRIMARY_NON_GLOBAL_WORKSPACE\", on_current_monitor = true })" >/dev/null 2>&1 || true
fi

if [ "${TSK_CONTAINER_ISOLATION:-0}" = "1" ] && [ -n "$TSK_CONTAINER_NAME" ] && command -v distrobox >/dev/null 2>&1; then
  if command -v cursor >/dev/null 2>&1; then
    exec distrobox enter --name "$TSK_CONTAINER_NAME" --no-tty -- cursor --classic "$TSK_TASK_REPO"
  fi
fi

if command -v cursor >/dev/null 2>&1; then
  exec cursor --classic "$TSK_TASK_REPO"
fi
