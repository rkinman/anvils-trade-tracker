import { 
  Moon, Sun, Monitor, Zap, Disc, 
  Sunset, Trees, Waves, Star, Terminal, Ghost 
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

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
          {theme === 'sunset' && <Sunset className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'forest' && <Trees className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'ocean' && <Waves className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'midnight' && <Star className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'terminal' && <Terminal className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'dracula' && <Ghost className="h-[1.2rem] w-[1.2rem]" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Select Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" /> Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" /> Dark
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setTheme("cyberpunk")}>
            <Zap className="mr-2 h-4 w-4" /> Cyberpunk
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("neon")}>
            <Disc className="mr-2 h-4 w-4" /> Neon Night
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("deep-space")}>
            <Monitor className="mr-2 h-4 w-4" /> Deep Space
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setTheme("sunset")}>
            <Sunset className="mr-2 h-4 w-4" /> Sunset
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("forest")}>
            <Trees className="mr-2 h-4 w-4" /> Forest
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("ocean")}>
            <Waves className="mr-2 h-4 w-4" /> Ocean
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("midnight")}>
            <Star className="mr-2 h-4 w-4" /> Midnight
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setTheme("terminal")}>
            <Terminal className="mr-2 h-4 w-4" /> Terminal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dracula")}>
            <Ghost className="mr-2 h-4 w-4" /> Vampire
          </DropdownMenuItem>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}