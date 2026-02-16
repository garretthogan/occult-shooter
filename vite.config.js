/**
 * Vite config: choose a safe base path for GitHub Pages builds.
 */

import { defineConfig } from 'vite';

function resolveBasePath() {
  const explicitBasePath = process.env.VITE_BASE_PATH;
  if (typeof explicitBasePath === 'string' && explicitBasePath.trim().length > 0) {
    const withSlashes = `/${explicitBasePath.trim().replace(/^\/+|\/+$/g, '')}/`;
    return withSlashes === '//' ? '/' : withSlashes;
  }

  if (process.env.GITHUB_ACTIONS !== 'true') {
    return '/';
  }

  const repositorySlug = process.env.GITHUB_REPOSITORY ?? '';
  const [, repositoryName = ''] = repositorySlug.split('/');
  if (repositoryName.length === 0 || repositoryName.endsWith('.github.io')) {
    return '/';
  }
  return `/${repositoryName}/`;
}

function showCombinedDevUrls() {
  return {
    name: 'combined-dev-urls',
    configureServer(server) {
      if (server.httpServer == null) return;
      server.httpServer.once('listening', () => {
        let attempts = 0;
        const maxAttempts = 20;
        const poll = () => {
          attempts += 1;
          const localUrl = server.resolvedUrls?.local?.[0] ?? null;
          const lanUrl = server.resolvedUrls?.network?.[0] ?? null;
          if (localUrl != null && lanUrl != null) {
            server.config.logger.info(`  ➜  Open:    ${localUrl}  |  LAN: ${lanUrl}`);
            return;
          }
          if (attempts < maxAttempts) {
            setTimeout(poll, 50);
          }
        };
        poll();
      });
    },
  };
}

export default defineConfig({
  base: resolveBasePath(),
  server: {
    host: true,
  },
  plugins: [showCombinedDevUrls()],
});
