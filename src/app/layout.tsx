import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SiteChrome from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: {
    default: "SamaSama | Group Buys for Useful Home Appliances in Singapore",
    template: "%s | SamaSama",
  },
  description:
    "SamaSama sources practical home appliances and organises transparent group buys for Singapore homes.",
  keywords: [
    "SamaSama",
    "group buy Singapore",
    "home appliances Singapore",
    "appliance group buy Singapore",
    "Singapore home essentials",
    "curated appliances Singapore",
  ],
  metadataBase: new URL("https://www.samasama.sg"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_SG",
    siteName: "SamaSama",
    title: "SamaSama | Group Buys for Useful Home Appliances in Singapore",
    description:
      "Useful home appliances, sourced carefully and brought in through transparent group buys for Singapore homes.",
    url: "/",
    images: [
      {
        url: "/samasama-home-banner.png",
        width: 1536,
        height: 1024,
        alt: "Air fryer on a warm kitchen table with neutral home styling",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SamaSama | Group Buys for Useful Home Appliances in Singapore",
    description:
      "Practical home appliances sourced carefully through transparent group buys for Singapore homes.",
    images: ["/samasama-home-banner.png"],
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
        <SiteChrome><Header /></SiteChrome>
        <main style={{ flex: 1 }}>{children}</main>
        <SiteChrome><Footer /></SiteChrome>
      </body>
    </html>
  );
}
