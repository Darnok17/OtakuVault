import type { Metadata } from "next";
import "./globals.css";
import "./ov.css";
import "./_themes/terminal.css";
import "./_themes/rustic.css";
import "./_themes/retro.css";
import "./_themes/minimal.css";
import "./_themes/comic-strip.css";
import "./_themes/manga.css";
import { fontVariables } from "./fonts";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/themes";
import InlineScript from "./_components/InlineScript";
import SiteNav from "./_components/SiteNav";
import ThemeFx from "./_components/ThemeFx";
import ThemeProvider from "./_components/ThemeProvider";

export const metadata: Metadata = {
  title: "OtakuVault",
  description: "Personal collection tracker for anime, manga, webtoons, and novels.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script swaps data-theme before React hydrates, hence suppressHydrationWarning.
    <html lang="en" data-theme={DEFAULT_THEME} className={fontVariables} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body>
        <ThemeProvider>
          <SiteNav />
          {children}
          <ThemeFx />
        </ThemeProvider>
      </body>
    </html>
  );
}
