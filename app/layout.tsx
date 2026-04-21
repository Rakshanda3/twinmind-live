import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "TwinMind — Live Suggestions",
  description: "Real-time AI meeting copilot",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}