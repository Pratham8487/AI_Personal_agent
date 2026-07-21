// PM2 process definition — pm2 start deploy/ecosystem.config.cjs
//
// fork mode with instances:1 is REQUIRED, not a default we happened to keep.
// Baileys WhatsApp sockets live in globalThis (lib/server/whatsapp-manager.ts,
// globalThis.__waSessions). Under cluster mode a user paired on worker A is
// invisible to worker B, and pairing breaks non-deterministically.

module.exports = {
  apps: [
    {
      name: "aster",
      cwd: "/home/ubuntu/aster",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000",
      instances: 1,
      exec_mode: "fork",

      // Next loads .env.local itself at runtime in production, so the rest of
      // the config lives there. These two must be real process env: lookup
      // order is process.env first (see Next's environment-variables guide),
      // and NODE_ENV gates the Secure flag on session cookies.
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },

      max_memory_restart: "1500M",
      autorestart: true,
      restart_delay: 4000,

      error_file: "/home/ubuntu/.pm2/logs/aster-error.log",
      out_file: "/home/ubuntu/.pm2/logs/aster-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
