import { resolve } from 'node:path';
import { buildLicenseNotices, collectPackageNotices } from './licenseNotices';
import { ACKNOWLEDGED_PATTERNS, ACKNOWLEDGED_SUBJECTS } from './licensePolicy';
import { VENDORED_NOTICES } from './vendoredNotices';

const root = resolve('.');

// Renders rather than only collecting: the vendored-notice policy check runs on
// the render path, so collecting alone would let a GPL hand-port through.
buildLicenseNotices(root);

console.log(
  `[licenses] ${collectPackageNotices(root).length} production packages + ${VENDORED_NOTICES.length} vendored entries ` +
    `pass the license policy (${Object.keys(ACKNOWLEDGED_SUBJECTS).length + ACKNOWLEDGED_PATTERNS.length} acknowledged exceptions).`,
);
