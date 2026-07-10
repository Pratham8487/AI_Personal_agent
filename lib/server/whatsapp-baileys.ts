/**
 * Baileys is ESM-only and kept out of the server bundle
 * (next.config.ts serverExternalPackages), so load it through a dynamic
 * import and reuse the single module instance.
 */
let baileysModule: Promise<typeof import("baileys")> | null = null;

export function loadBaileys(): Promise<typeof import("baileys")> {
  return (baileysModule ??= import("baileys"));
}
