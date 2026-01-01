import { 
  Moon, Sun, 
  Star, CandlestickChart, Crown, Sparkles, Gift,
  Leaf, Cloud, FileText, Gem
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

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          {theme === 'light' && <Sun className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'dark' && <Moon className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'midnight' && <Star className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'tasty' && <CandlestickChart className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'luxury' && <Crown className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'legend' && <Sparkles className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'christmas' && <Gift className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'mint' && <Leaf className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'sky' && <Cloud className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'paper' && <FileText className="h-[1.2rem] w-[1.2rem]" />}
          {theme === 'amethyst' && <Gem className="h-[1.2rem] w-[1.2rem]" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Standard Themes</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Dark
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Crisp Light Themes</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("mint")}>
          <Leaf className="mr-2 h-4 w-4" /> Mint Professional
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("sky")}>
          <Cloud className="mr-2 h-4 w-4" /> Sky Financial
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("paper")}>
          <FileText className="mr-2 h-4 w-4" /> Paper Minimal
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Atmospheric Themes</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("amethyst")}>
          <Gem className="mr-2 h-4 w-4" /> Amethyst Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("legend")}>
          <Sparkles className="mr-2 h-4 w-4" /> Legend
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("tasty")}>
          <CandlestickChart className="mr-2 h-4 w-4" /> Tastytrade
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("midnight")}>
          <Star className="mr-2 h-4 w-4" /> Midnight
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Specialty</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("luxury")}>
          <Crown className="mr-2 h-4 w-4" /> Luxury Gold
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("christmas")}>
          <Gift className="mr-2 h-4 w-4" /> Christmas
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}