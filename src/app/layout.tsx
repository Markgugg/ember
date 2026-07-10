import type { Metadata } from "next";
import { Instrument_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Current — posts powered by what's current",
  description:
    "Current reads what the AI world is arguing about right now, mines the claims out of your conversations, and writes the LinkedIn post where they meet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
