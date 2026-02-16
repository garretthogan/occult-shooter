# GitHub Pages Deployment

This repo is configured for GitHub Pages deployments with GitHub Actions.

## How to Deploy

1. Push your changes to `main` (or `master`), or run the workflow manually from the **Actions** tab.
2. In GitHub, go to **Settings -> Pages**.
3. Set **Source** to **GitHub Actions**.
4. The workflow named **Deploy To GitHub Pages** will publish the `dist` output.

## Notes

- Vite base path is auto-detected in CI:
  - User/org site (`<name>.github.io`) uses `/`
  - Project site uses `/<repo-name>/`
- SPA fallback is enabled by copying `dist/index.html` to `dist/404.html` during deploy.
