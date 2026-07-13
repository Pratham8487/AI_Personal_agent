import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // TODO: replace with your Trigger.dev project ref after `npx trigger.dev@latest init`
  // (Trigger.dev dashboard → Project → Settings → Project ref, e.g. "proj_abcdefgh").
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_replace_me",
  dirs: ["./trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,
    },
  },
});
