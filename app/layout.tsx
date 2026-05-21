import type { Metadata } from "next";
import { DM_Serif_Display, Poppins } from "next/font/google";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-playfair", // keep the same CSS variable name so we don't have to edit globals.css again
  weight: "400",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-quicksand", // keep the same CSS variable name
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Naegablé - Sweet Treats & Pastries",
  description: "Katalog Aneka Manisan, Brownies, dan Cookies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${dmSerif.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans text-stone-800">{children}</body>
    </html>
  );
}
