import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

function getStoredMode(): ThemeMode | "auto" | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return null;
}

function resolveMode(stored: ThemeMode | "auto" | null): ThemeMode {
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(mode);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const resolved = resolveMode(getStoredMode());
    setMode(resolved);
    applyThemeMode(resolved);
  }, []);

  function toggleMode() {
    const nextMode: ThemeMode = mode === "light" ? "dark" : "light";
    setMode(nextMode);
    applyThemeMode(nextMode);
    window.localStorage.setItem("theme", nextMode);
  }

  const label = mode === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleMode}
      aria-label={label}
      title={label}
    >
      {mode === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
