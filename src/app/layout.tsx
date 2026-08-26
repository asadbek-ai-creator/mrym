import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mariyam · Financial Accounting",
  description: "Cash, bank and credit accounting dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
