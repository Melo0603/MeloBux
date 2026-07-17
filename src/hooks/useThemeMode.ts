import { useEffect, useState } from "react";

const storageKey = "melobux-theme";

function storedTheme() {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
}

export function useThemeMode() {
  const [theme, setTheme] = useState<"light" | "dark">(storedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  return {
    theme,
    darkMode: theme === "dark",
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark"))
  };
}
