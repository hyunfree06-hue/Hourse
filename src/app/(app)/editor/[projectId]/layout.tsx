export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bypass the app chrome for full-bleed editor.
  return <div className="fixed inset-0 z-50 bg-white">{children}</div>;
}
