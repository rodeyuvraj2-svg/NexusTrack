import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

/**
 * Handles the OAuth callback route (~oauth/initiate).
 *
 * The Supabase project is configured so OAuth redirects go to
 * `/~oauth/initiate`. When running locally, that route doesn't exist,
 * so we forward it to `/auth` where the standard Supabase PKCE callback
 * processing lives.
 *
 * Once the Supabase project's Auth / OAuth provider redirect URLs are
 * updated to point directly to `/auth`, this plugin can be removed.
 */
function oauthRedirectPlugin(): Plugin {
  return {
    name: "oauth-redirect-compat",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/~oauth/initiate", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const location = `/auth${url.search}${url.hash}`;
        res.writeHead(302, { Location: location });
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        entry: "server",
      },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // Generate Vercel Functions for production instead of a Cloudflare Worker.
    nitro({ preset: "vercel" }),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    react(),
    oauthRedirectPlugin(),
  ],
  css: {
    transformer: "lightningcss",
  },
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  server: {
    host: "::",
    port: 8080,
  },
});
