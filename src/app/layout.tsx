import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import IdentityWidget from "@/components/IdentityWidget";
import NotificationBell from "@/components/NotificationBell";

// Tipografia da marca: Space Grotesk (títulos e wordmark), Inter (leitura) e
// JetBrains Mono (dados e rótulos), expostas como as CSS vars --disp, --body e
// --mono que o globals.css consome.
const disp = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-disp",
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "attacca",
  description:
    "Transcrições musicais colaborativas — alguém começa, você continua.",
};

// Roda antes da pintura para evitar flash de tema. Escuro é o padrão, já no
// data-theme do <html>; só troca se a pessoa tiver salvo "light".
const themeBootstrap = `try{if(localStorage.getItem("attacca:theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: algumas extensões de navegador injetam
    // atributos em <html> e <body> antes de o React hidratar.
    <html
      lang="pt-BR"
      data-theme="dark"
      className={`${disp.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <header className="site-header">
          <Link href="/" className="brand">
            attacca
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
