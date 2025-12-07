import { Moon, Sun, Monitor, Zap, Disc } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          {theme === 'light' && <Sun className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'dark' && <Moon className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'cyberpunk' && <Zap className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'neon' && <Disc className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'deep-space' && <Monitor className="h-[1.2rem] w-[1.2rem]" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("cyberpunk")}>
          <Zap className="mr-2 h-4 w-4" /> Cyberpunk
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("neon")}>
          <Disc className="mr-2 h-4 w-4" /> Neon
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("deep-space")}>
          <Monitor className="mr-2 h-4 w-4" /> Deep Space
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}