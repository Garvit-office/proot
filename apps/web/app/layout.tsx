import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Proot — for dogs, nearby",
  description:
    "Shop, care, events, parks, friends, and nutrition tracking for your pet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <Nav />
        {children}
        <footer className="wrap footer">
          <span>proot · made quietly for dogs</span>
          <span>Maple’s neighborhood</span>
        </footer>
      </body>
    </html>
  );
}
