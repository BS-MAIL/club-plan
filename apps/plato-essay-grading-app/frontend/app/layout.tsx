import "./styles.css";

export const metadata = {
  title: "Math Essay Grader",
  description: "Local grading app for handwritten Korean math answers"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
