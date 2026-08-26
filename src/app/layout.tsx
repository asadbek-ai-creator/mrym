import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mariyam · Финансовый учёт",
  description: "Панель учёта кассы, банка и кредитов",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
