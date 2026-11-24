/**
 * Puppeteer's install script downloads Chrome on every `npm install` / `npm ci` by default. Only the
 * optional browser tools need it (scripts/verify-subpixel.mts; see
 * .agents/skills/subpixel-aa/SKILL.md), so the download is opt-in. Install it when you need it:
 *
 *   npx puppeteer browsers install chrome
 *
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  skipDownload: true,
};
