export default function Template({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-full animate-fade-up">{children}</div>;
}
