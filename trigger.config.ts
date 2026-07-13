import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_omozcipqdzkwptlfoqhf",
  dirs: ["./trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,
    },
  },
});
