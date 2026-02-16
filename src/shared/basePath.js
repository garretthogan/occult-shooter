/**
 * Shared helpers for base-path-safe URLs across local and GitHub Pages builds.
 */

const rawBaseUrl = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
const normalizedBasePath = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
const appBasePath = normalizedBasePath === '/' ? '' : normalizedBasePath;

function normalizeRoutePath(path) {
  const value = String(path ?? '').trim();
  if (value.length === 0 || value === '/') return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

export function withBasePath(path) {
  const normalizedPath = normalizeRoutePath(path);
  if (appBasePath.length === 0) {
    return normalizedPath;
  }
  if (normalizedPath === '/') {
    return `${appBasePath}/`;
  }
  return `${appBasePath}${normalizedPath}`;
}

export function stripBasePath(pathname) {
  const value = normalizeRoutePath(pathname);
  if (appBasePath.length === 0) return value;
  if (value === appBasePath || value === `${appBasePath}/`) {
    return '/';
  }
  if (value.startsWith(`${appBasePath}/`)) {
    return value.slice(appBasePath.length);
  }
  return value;
}

export function toBaseRelativePath(path) {
  const value = normalizeRoutePath(path);
  if (appBasePath.length === 0) return value;
  if (value === appBasePath || value === `${appBasePath}/`) {
    return '/';
  }
  if (value.startsWith(`${appBasePath}/`)) {
    return value.slice(appBasePath.length);
  }
  return value;
}
