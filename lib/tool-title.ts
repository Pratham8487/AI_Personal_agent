/**
 * Human-readable MCP tool title.
 *
 *   "fetch_recent_messages"              -> "Fetch recent messages"
 *   "mcp_MailTools_graph_mail_sendMail"  -> "Send mail"
 *
 * Microsoft's Work IQ tools are namespaced "mcp_<Server>Tools_graph_[area_]<verb>";
 * only the trailing verb means anything to a reader, and the server name is
 * already shown as the group heading.
 */
export function toolTitle(name: string): string {
  const verb = name.replace(/^mcp_\w+?Tools_graph_(?:\w+?_)?/, "");
  const words = verb
    .replace(/_/g, " ")
    // camelCase -> separate words, so "findMeetingTimes" reads as a sentence.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
