import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import IdentityWidget from "@/components/IdentityWidget";
import NotificationBell from "@/components/NotificationBell";

export const metadata: Metadata = {
  title: "GitSong",
  description: "Transcrições musicais colaborativas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: some browser extensions (e.g. Bitdefender)
    // inject attributes into <html>/<body> before React hydrates.
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-icon">♪</span>
            GitSong
          </Link>
          <div className="header-spacer" />
          <NotificationBell />
          <IdentityWidget />
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
