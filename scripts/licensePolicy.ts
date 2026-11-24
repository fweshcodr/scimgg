/**
 * Which licenses may appear in a build of this project.
 *
 * This is the gate that halts the pipeline. `collectPackageNotices` runs it over
 * every production dependency and over `VENDORED_NOTICES`, so a copyleft package
 * added to `dependencies` — or a copyleft project ported into `src/` — fails
 * `npm run build` instead of quietly putting the MIT-licensed bundle under
 * someone else's terms.
 *
 * The gate fails closed. A declaration passes only if it is one of the
 * `ACKNOWLEDGED_*` exceptions, or every license that binds us under it is on
 * `PERMITTED_LICENSES`: each conjunct of an `AND`, and of each `OR` the
 * alternative recorded as elected. An identifier the gate does not recognize
 * (`APSL-2.0`, a misspelling, free text), a malformed expression, a choice of
 * licenses with no recorded election (even between two permissive ones), and a
 * package that declares nothing (`NOASSERTION`) all stop the build for review.
 *
 * The tiers exist because the failure modes need different answers. A
 * `forbidden` license cannot be satisfied by a minified single-file bundle at
 * all. A `review` license can be, but only by doing something deliberate
 * (publishing the covered source, or reading terms the gate cannot), so it must
 * not pass silently either.
 */

export type LicenseTier = 'forbidden' | 'review';

interface Verdict {
  readonly tier: LicenseTier;
  readonly reason: string;
}

interface PolicyRule extends Verdict {
  readonly pattern: RegExp;
}

/**
 * Licenses that ship in this MIT bundle on the strength of their notice alone, as upper-cased
 * SPDX identifiers. Adding one is a policy decision: read the license first.
 */
const PERMITTED_LICENSES: ReadonlySet<string> = new Set([
  '0BSD',
  'APACHE-2.0',
  'APACHE-2.0 WITH LLVM-EXCEPTION',
  'BSD-2-CLAUSE',
  'BSD-3-CLAUSE',
  'BZIP2-1.0.6',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'NCSA',
  'UNLICENSE',
  'ZLIB',
]);

const UNRECOGNISED_LICENSE: Verdict = {
  tier: 'review',
  reason:
    'Not a license this gate recognizes. Read its terms; if they are permissive, add the identifier to ' +
    'PERMITTED_LICENSES in scripts/licensePolicy.ts, or record the subject in ACKNOWLEDGED_SUBJECTS',
};

/**
 * Known restrictive licenses, so a violation names the actual problem rather than "unrecognized".
 * Evaluated in order, so narrower identifiers win. No trailing `\b` on the GNU families, so a
 * non-SPDX spelling such as `GPLv3` is still caught as GPL.
 */
const POLICY_RULES: readonly PolicyRule[] = [
  {
    pattern: /\bLGPL/,
    tier: 'forbidden',
    reason:
      'LGPL requires the user be able to relink a modified library, which a minified single-file bundle cannot offer',
  },
  {
    pattern: /\bAGPL/,
    tier: 'forbidden',
    reason: 'AGPL extends copyleft to network use and would reach this entire app',
  },
  {
    pattern: /\bGPL/,
    tier: 'forbidden',
    reason: 'GPL copyleft would require the whole bundle be distributed under the GPL rather than MIT',
  },
  { pattern: /\bSSPL\b/, tier: 'forbidden', reason: 'SSPL copyleft extends to the service stack' },
  { pattern: /\bOSL\b/, tier: 'forbidden', reason: 'OSL is a strong copyleft license' },
  { pattern: /\bEUPL\b/, tier: 'forbidden', reason: 'EUPL is a strong copyleft license' },
  {
    pattern: /\bCPAL\b/,
    tier: 'forbidden',
    reason: 'CPAL is a strong copyleft license with an attribution-notice requirement',
  },
  {
    pattern: /\bRPL\b/,
    tier: 'forbidden',
    reason: 'RPL requires publishing modifications even when unused externally',
  },
  {
    pattern: /\bBUSL\b|\bBUSINESS SOURCE\b/,
    tier: 'forbidden',
    reason: 'BUSL restricts production use until its change date',
  },
  { pattern: /\bELASTIC-2\.0\b/, tier: 'forbidden', reason: 'Elastic 2.0 restricts hosted and managed-service use' },
  {
    pattern: /\bCOMMONS[- ]CLAUSE\b/,
    tier: 'forbidden',
    reason: 'The Commons Clause removes the right to sell the software',
  },
  {
    pattern: /\bPARITY\b|\bPOLYFORM\b/,
    tier: 'forbidden',
    reason: 'Parity and PolyForm licenses restrict proprietary or commercial use',
  },
  {
    pattern: /\bCC-BY[-A-Z0-9.]*-(NC|ND)\b|\bCC-BY-SA\b|\bCC-BY[-A-Z0-9.]*-SA\b/,
    tier: 'forbidden',
    reason: 'Creative Commons NonCommercial / ShareAlike / NoDerivatives terms would restrict the whole bundle',
  },
  {
    pattern: /^UNLICENSED$/,
    tier: 'forbidden',
    reason: 'npm\'s "UNLICENSED" means all rights reserved — there is no grant to redistribute it',
  },
  {
    pattern: /^NOASSERTION$/,
    tier: 'review',
    reason:
      'The package declares no license, and its license text is not one this gate can classify. Read it; ' +
      'if it is permissive, record the package in ACKNOWLEDGED_SUBJECTS with license "NOASSERTION"',
  },
  {
    pattern: /\bSEE LICEN[CS]E IN\b|\bCUSTOM\b|\bPROPRIETARY\b/,
    tier: 'review',
    reason: 'The terms are not machine-readable and must be read before shipping',
  },
  {
    pattern: /\bMPL\b/,
    tier: 'review',
    reason: 'MPL is file-level copyleft: bundling it obliges us to publish the source of the covered files',
  },
  {
    pattern: /\bEPL\b|\bCDDL\b|\bMS-RL\b/,
    tier: 'review',
    reason: 'File-level copyleft: bundling obliges us to make the covered source available',
  },
];

/**
 * Deliberate exceptions, each with the reason it was accepted.
 *
 * Keyed by subject rather than by license so that granting one exception cannot
 * silently admit a second package under the same terms. Some entries are a
 * standing obligation on whoever redistributes the build: the Creative Commons
 * one keeps the Wiki-derived data non-commercial and share-alike, whatever the
 * code around it is licensed under (see THIRD_PARTY_NOTICES.md). The others are
 * declarations with no SPDX identifier, read and accepted by hand.
 */
export interface Acknowledgement {
  /** The exact declaration this exception covers. Anything else re-enters the gate. */
  readonly license: string;
  readonly reason: string;
}

export const ACKNOWLEDGED_SUBJECTS: Readonly<Record<string, Acknowledgement>> = {
  'Old School RuneScape Wiki datasets': {
    license: 'CC-BY-NC-SA-3.0',
    reason:
      'Wiki-derived data, distributed with attribution under its own license, separate from the MIT code. ' +
      'Anyone redistributing it, or an adaptation of it, must keep it non-commercial and share-alike.',
  },
  'Old School RuneScape game content': {
    license: 'Owned by Jagex Ltd; not licensed by this project',
    reason:
      'Not a license: the statement that Jagex owns the game content a build made after setup contains, ' +
      'and that this project neither licenses it nor claims permission for it.',
  },
  'Mulberry32, by Tommy Ettinger, in the JavaScript form of bryc/code PRNGs.md': {
    license: 'Public domain',
    reason:
      'PRNGs.md declares itself public domain and the original C carries a CC0 dedication; there is no SPDX id for the former.',
  },
};

/**
 * Families acknowledged by pattern, for packages whose name varies per platform.
 *
 * An exact-name entry cannot express these: npm installs a different optional
 * binary per host, so `lightningcss-linux-x64-gnu` on this machine is
 * `lightningcss-darwin-arm64` on a laptop and something else again on another
 * machine. Listing only the names seen locally makes the build pass here and
 * fail there.
 */
export const ACKNOWLEDGED_PATTERNS: readonly (Acknowledgement & { readonly pattern: RegExp })[] = [
  {
    pattern: /^lightningcss(-|$)/,
    license: 'MPL-2.0',
    reason:
      'A build-time CSS transformer that reaches the production graph only because vite is in `dependencies`. ' +
      'None of its code is emitted into dist/, so the obligation to publish covered source is not triggered.',
  },
];

/**
 * An exception applies only to the license it was granted for.
 *
 * Matching on the subject alone is how `lightningcss-evil@1.0.0`, declaring
 * AGPL, would inherit the MPL exception granted to the real package — the name
 * is attacker- and typo-controlled, the declaration is what actually binds us.
 */
function acknowledgementFor(subject: string, declared: string): Acknowledgement | undefined {
  const candidate =
    ACKNOWLEDGED_SUBJECTS[subject] ?? ACKNOWLEDGED_PATTERNS.find(({ pattern }) => pattern.test(subject));
  if (candidate === undefined) return undefined;
  return candidate.license.toUpperCase() === declared.trim().toUpperCase() ? candidate : undefined;
}

export interface LicenseViolation {
  readonly subject: string;
  readonly license: string;
  readonly tier: LicenseTier;
  readonly reason: string;
}

export class RestrictiveLicenseError extends Error {
  constructor(readonly violations: readonly LicenseViolation[]) {
    super(
      `The license policy blocks this build:\n` +
        violations.map((v) => `  - ${v.subject} is "${v.license}" [${v.tier}]\n      ${v.reason}`).join('\n') +
        '\n\nRemove the dependency, replace it with a permissively licensed equivalent, or — if the\n' +
        'terms genuinely are acceptable — add the license to PERMITTED_LICENSES, or the subject to\n' +
        'ACKNOWLEDGED_SUBJECTS, in scripts/licensePolicy.ts with the reason it was accepted.',
    );
    this.name = 'RestrictiveLicenseError';
  }
}

/**
 * A parsed SPDX license expression. `AND` binds tighter than `OR`, as the SPDX grammar specifies, and
 * parentheses group. A license's words run up to the next operator or parenthesis, so `WITH`
 * exceptions and free text such as `SEE LICENSE IN LICENSE.txt` stay one license.
 */
type LicenseExpression =
  | { readonly kind: 'license'; readonly id: string }
  | { readonly kind: 'and'; readonly terms: readonly LicenseExpression[] }
  | { readonly kind: 'or'; readonly alternatives: readonly LicenseExpression[] };

/** Upper-cased throughout, so identifiers compare case-insensitively. `undefined` if malformed. */
function parseLicenseExpression(expression: string): LicenseExpression | undefined {
  const tokens = expression.toUpperCase().match(/[()]|[^\s()]+/g) ?? [];
  let position = 0;

  const parseOr = (): LicenseExpression | undefined => {
    const alternatives: LicenseExpression[] = [];
    for (;;) {
      const term = parseAnd();
      if (term === undefined) return undefined;
      alternatives.push(term);
      if (tokens[position] !== 'OR') break;
      position++;
    }
    return alternatives.length === 1 ? alternatives[0] : { kind: 'or', alternatives };
  };

  const parseAnd = (): LicenseExpression | undefined => {
    const terms: LicenseExpression[] = [];
    for (;;) {
      const term = parseAtom();
      if (term === undefined) return undefined;
      terms.push(term);
      if (tokens[position] !== 'AND') break;
      position++;
    }
    return terms.length === 1 ? terms[0] : { kind: 'and', terms };
  };

  const parseAtom = (): LicenseExpression | undefined => {
    if (tokens[position] === '(') {
      position++;
      const inner = parseOr();
      if (inner === undefined || tokens[position] !== ')') return undefined;
      position++;
      return inner;
    }
    const words: string[] = [];
    while (position < tokens.length && !['(', ')', 'AND', 'OR'].includes(tokens[position])) {
      words.push(tokens[position++]);
    }
    return words.length === 0 ? undefined : { kind: 'license', id: words.join(' ') };
  };

  const parsed = parseOr();
  return parsed !== undefined && position === tokens.length ? parsed : undefined;
}

/** One canonical spelling per expression, so an election can be compared with what was offered. */
function formatExpression(node: LicenseExpression): string {
  switch (node.kind) {
    case 'license':
      return node.id;
    case 'and':
      return node.terms
        .map((term) => (term.kind === 'or' ? `(${formatExpression(term)})` : formatExpression(term)))
        .join(' AND ');
    case 'or':
      return node.alternatives.map(formatExpression).join(' OR ');
  }
}

/** A known restrictive license's rule, `UNRECOGNISED_LICENSE`, or `undefined` for a permitted one. */
function judgeTerm(term: string): Verdict | undefined {
  const rule = POLICY_RULES.find((candidate) => candidate.pattern.test(term));
  if (rule !== undefined) return rule;
  return PERMITTED_LICENSES.has(term) ? undefined : UNRECOGNISED_LICENSE;
}

function worstVerdict(verdicts: readonly (Verdict | undefined)[]): Verdict | undefined {
  return verdicts.find((verdict) => verdict?.tier === 'forbidden') ?? verdicts.find((verdict) => verdict !== undefined);
}

/**
 * Every conjunct of an `AND` binds us, so each must pass on its own: `MIT AND Zlib` passes,
 * `MIT AND GPL-3.0` and `MIT AND APSL-2.0` do not. Each `OR`, wherever it sits, must be resolved by
 * the election, which then has to pass as that conjunct; it never stands in for the whole
 * expression, so `GPL-3.0 AND (Apache-2.0 OR MIT)` with MIT elected still fails on the GPL.
 */
function evaluate(node: LicenseExpression, election: Election): Verdict | undefined {
  switch (node.kind) {
    case 'license':
      return judgeTerm(node.id);
    case 'and':
      return worstVerdict(node.terms.map((term) => evaluate(term, election)));
    case 'or': {
      const choice = formatExpression(node);
      if (election.elected === undefined) {
        // A choice is only a real choice once we have written down which half we take, so an
        // un-elected `OR` stops the build even when every half would pass.
        const blocked = worstVerdict(node.alternatives.map((alternative) => evaluate(alternative, election)));
        return blocked === undefined
          ? {
              tier: 'review',
              reason: `"${choice}" is a choice of licenses with no recorded election — record the one this project takes in LICENSE_ELECTIONS`,
            }
          : {
              tier: blocked.tier,
              reason: `${blocked.reason}. "${choice}" is a choice of licenses — record the permissive half in LICENSE_ELECTIONS`,
            };
      }
      const taken = node.alternatives.find((alternative) => formatExpression(alternative) === election.elected);
      if (taken === undefined) {
        return {
          tier: 'forbidden',
          reason: `Elected "${election.raw}", which is not one of the licenses this package offers in "${choice}"`,
        };
      }
      election.used = true;
      return evaluate(taken, election);
    }
  }
}

interface Election {
  /** The election as written, for messages. */
  readonly raw?: string;
  /** Canonical form, compared against each choice's alternatives. */
  readonly elected?: string;
  /** Whether any choice in the expression took it. */
  used: boolean;
}

/**
 * `elected` is the alternative we chose from a choice of licenses. It is required rather than
 * inferred: silently taking the permissive half of `MIT OR GPL-3.0` is exactly the unrecorded
 * assumption that leaves the GPL branch arguably live.
 */
export function findLicenseViolation(
  subject: string,
  declared: string,
  elected?: string,
): LicenseViolation | undefined {
  if (acknowledgementFor(subject, declared) !== undefined) return undefined;

  const expression = parseLicenseExpression(declared);
  if (expression === undefined) {
    return {
      subject,
      license: declared,
      tier: 'review',
      reason: 'Not a well-formed SPDX expression — read the terms by hand before shipping them',
    };
  }

  const parsedElection = elected === undefined ? undefined : parseLicenseExpression(elected);
  const election: Election = {
    raw: elected,
    elected: parsedElection === undefined ? elected?.trim().toUpperCase() : formatExpression(parsedElection),
    used: false,
  };
  const verdict = evaluate(expression, election);

  // An election is a choice among what was offered. Unvalidated, a typo or a wrong entry in
  // LICENSE_ELECTIONS silently launders a GPL-only package into a permissive one, which is the
  // worst way this gate can fail, so an election no choice took is reported ahead of the verdict.
  if (elected !== undefined && !election.used) {
    return {
      subject,
      license: declared,
      tier: 'forbidden',
      reason: `Elected "${elected}", which is not one of the licenses this package offers`,
    };
  }
  return verdict === undefined ? undefined : { subject, license: declared, tier: verdict.tier, reason: verdict.reason };
}

export function assertLicensePolicy(
  entries: readonly { readonly subject: string; readonly declared: string; readonly elected?: string }[],
): void {
  const violations = entries
    .map(({ subject, declared, elected }) => findLicenseViolation(subject, declared, elected))
    .filter((violation): violation is LicenseViolation => violation !== undefined);

  if (violations.length > 0) throw new RestrictiveLicenseError(violations);
}
