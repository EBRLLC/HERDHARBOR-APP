# HerdHarbor landing page

This folder contains a complete responsive static landing page for HerdHarbor.

## Files

- `index.html` — page structure and content
- `styles.css` — approved HerdHarbor colors and responsive design
- `script.js` — mobile navigation and early-access form behavior
- `assets/herdharbor-icon.png` — approved app icon

## Current signup behavior

The early-access form opens the visitor's email app and prepares a message addressed to:

`hello@herdharbor.com`

This works without a server or paid form service. Before public launch, the form can be connected to a database-backed signup service so submissions happen directly on the page.

## Publish with GitHub Pages

1. Create a new GitHub repository, such as `herdharbor-site`.
2. Upload the contents of this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`.
6. Save and wait for GitHub Pages to publish the site.
7. In GitHub Pages settings, add the custom domain `herdharbor.com`.
8. GitHub will show the DNS records that need to be entered in Porkbun.

## Recommended production URL structure

- `herdharbor.com` — public landing page
- `app.herdharbor.com` — future application
- `herdharbor.app` — redirect to the public page or app download page

## Brand palette

- Deep Navy: `#0D2540`
- Harbor Teal: `#2E7D7B`
- Pasture Green: `#3F5F44`
- Warm Cream: `#F7F3EA`
- Stone Gray: `#8E979D`
