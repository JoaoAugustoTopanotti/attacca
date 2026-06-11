import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitSong",
  description: "Transcrições musicais colaborativas — Milestone 1",
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
            GitSong
          </Link>
          <span className="muted">transcrições musicais colaborativas</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
