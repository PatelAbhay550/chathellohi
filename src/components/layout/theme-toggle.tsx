
'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Theme = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const localTheme = localStorage.getItem('theme') as Theme | null;
    if (localTheme) {
      setThemeState(localTheme);
    }
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.classList.add(effectiveTheme);
    localStorage.setItem('theme', theme); // Store the user's explicit choice (light, dark, or system)
  }, [theme, mounted]);

  if (!mounted) {
    // Render a placeholder or nothing until mounted to avoid hydration mismatch
    // For a button in a dropdown, a simple placeholder might be best.
    return <Button variant="ghost" size="icon" disabled className="w-9 h-9"><Monitor className="h-[1.2rem] w-[1.2rem]" /></Button>;
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };
  
  const CurrentIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme ({theme})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
