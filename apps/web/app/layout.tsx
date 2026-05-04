import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agent Z",
    template: "%s · Agent Z",
  },
  description: "Discord AI agent and admin control plane on Vercel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`min-h-screen bg-background text-foreground antialiased ${GeistSans.className}`}>
        {children}
      </body>
    </html>
  );
}
