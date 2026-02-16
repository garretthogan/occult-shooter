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

export default defineConfig({
  base: resolveBasePath(),
});
