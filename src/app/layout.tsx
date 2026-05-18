import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "BatchDirect SG — Premium Home Appliances, Factory-Direct Group Buys",
    template: "%s | BatchDirect SG",
  },
  description:
    "Join Singapore's trusted group-buy platform for premium, factory-vetted home appliances. Pay a deposit, unlock better pricing together, collect locally.",
  keywords: [
    "group buy Singapore",
    "home appliances Singapore",
    "factory direct Singapore",
    "Chinese appliances Singapore",
    "group purchase",
  ],
  metadataBase: new URL("https://batchdirect.sg"),
  openGraph: {
    type: "website",
    locale: "en_SG",
    siteName: "BatchDirect SG",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-SG">
      <body>
        <Header />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
