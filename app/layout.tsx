import type { Metadata } from "next";
import { Bebas_Neue, Noto_Sans_JP, Space_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "./_components/SiteNav";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});
const notoJp = Noto_Sans_JP({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-noto-jp",
});
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "OtakuVault",
  description: "Personal collection tracker for anime, manga, webtoons, and novels.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${notoJp.variable} ${spaceMono.variable}`}>
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}