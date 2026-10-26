import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { LocaleSync } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "x-bookmark-reports",
  description: "Notion-style dashboard for managing Twitter/X bookmarks",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <LocaleSync />
        {children}
      </body>
    </html>
  );
}
