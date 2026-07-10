/** Human-readable MCP tool title: "fetch_recent_messages" -> "Fetch recent messages". */
export function toolTitle(name: string): string {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
