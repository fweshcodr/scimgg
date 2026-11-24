import { describe, expect, it } from 'vitest';
import { assertLicensePolicy, findLicenseViolation, RestrictiveLicenseError } from '../licensePolicy';

const verdict = (declared: string, elected?: string) => findLicenseViolation('pkg', declared, elected);

describe('findLicenseViolation', () => {
  it.each([
    'MIT',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    'Apache-2.0',
    'CC0-1.0',
    'CC-BY-4.0',
    '0BSD',
    'Zlib',
  ])('permits %s', (license) => {
    expect(verdict(license)).toBeUndefined();
  });

  it.each([
    ['GPL-3.0-only', 'GPL copyleft'],
    ['AGPL-3.0', 'AGPL extends copyleft'],
    ['LGPL-3.0-or-later', 'relink'],
    ['SSPL-1.0', 'SSPL'],
    ['OSL-3.0', 'OSL'],
    ['EUPL-1.2', 'EUPL'],
    ['BUSL-1.1', 'BUSL'],
    ['Elastic-2.0', 'Elastic'],
    ['CC-BY-NC-4.0', 'Creative Commons'],
    ['CC-BY-NC-SA-3.0', 'Creative Commons'],
    ['CC-BY-SA-4.0', 'Creative Commons'],
    ['UNLICENSED', 'all rights reserved'],
  ])('forbids %s', (license, expectedReason) => {
    const violation = verdict(license);
    expect(violation?.tier).toBe('forbidden');
    expect(violation?.reason).toContain(expectedReason);
  });

  it.each([
    'MPL-2.0',
    'EPL-2.0',
    'CDDL-1.1',
    'SEE LICENSE IN LICENSE.txt',
  ])('sends %s to review rather than passing it silently', (license) => {
    expect(verdict(license)?.tier).toBe('review');
  });

  // "Unlicense" is a public-domain dedication; "UNLICENSED" is npm's marker for
  // all-rights-reserved.
  it('distinguishes the Unlicense from UNLICENSED', () => {
    expect(verdict('Unlicense')).toBeUndefined();
    expect(verdict('UNLICENSED')?.tier).toBe('forbidden');
  });

  // The gate fails closed: an identifier it does not recognize is not assumed permissive.
  it.each([
    'APSL-2.0',
    'Beerware',
    'WTFPL',
    'Public domain',
    'MITT',
  ])('sends the unrecognized %s to review', (license) => {
    const violation = verdict(license);
    expect(violation?.tier).toBe('review');
    expect(violation?.reason).toContain('PERMITTED_LICENSES');
  });

  it.each(['GPLv3', 'GPLv2+', 'LGPLv2.1', 'AGPLv3'])('forbids the non-SPDX spelling %s', (license) => {
    expect(verdict(license)?.tier).toBe('forbidden');
  });

  it('permits the LLVM runtime exception, which is not a separate conjunct', () => {
    expect(verdict('Apache-2.0 WITH LLVM-exception')).toBeUndefined();
    expect(verdict('Apache-2.0 WITH Classpath-exception-2.0')?.tier).toBe('review');
  });

  it('classifies LGPL on its own terms rather than as plain GPL', () => {
    expect(verdict('LGPL-2.1')?.reason).toContain('relink');
    expect(verdict('GPL-2.0')?.reason).not.toContain('relink');
  });

  describe('compound expressions', () => {
    it('permits an AND where every conjunct is permissive', () => {
      expect(verdict('(MIT AND Zlib)')).toBeUndefined();
    });

    it('blocks an AND where any conjunct is restrictive', () => {
      expect(verdict('(MIT AND GPL-3.0)')?.tier).toBe('forbidden');
    });

    it('blocks an AND with an unrecognized conjunct', () => {
      expect(verdict('(MIT AND APSL-2.0)')?.tier).toBe('review');
      expect(verdict('(APSL-2.0 AND GPL-3.0)')?.tier).toBe('forbidden');
    });

    // Which notice binds is unrecorded until one half is elected, even when both would pass.
    it('demands an election between two permissive licenses', () => {
      const violation = verdict('(MIT OR ISC)');
      expect(violation?.tier).toBe('review');
      expect(violation?.reason).toContain('LICENSE_ELECTIONS');
      expect(verdict('(MIT OR ISC)', 'ISC')).toBeUndefined();
    });

    it('blocks an election of an unrecognized license', () => {
      expect(verdict('(MIT OR APSL-2.0)', 'APSL-2.0')?.tier).toBe('review');
    });

    it('permits a dual license once the permissive half is elected', () => {
      expect(verdict('(MIT OR GPL-3.0-or-later)', 'MIT')).toBeUndefined();
    });

    it('demands an election rather than assuming the permissive half', () => {
      const violation = verdict('(MIT OR GPL-3.0-or-later)');
      expect(violation?.tier).toBe('forbidden');
      expect(violation?.reason).toContain('LICENSE_ELECTIONS');
    });

    it('blocks an election that is itself restrictive', () => {
      expect(verdict('(MIT OR GPL-3.0-or-later)', 'GPL-3.0-or-later')?.tier).toBe('forbidden');
    });

    // Without binding the election to the declaration, a typo or a wrong entry
    // in LICENSE_ELECTIONS launders a GPL-only package into a permissive one.
    it('blocks an election the package never offered', () => {
      const violation = verdict('GPL-3.0-only', 'MIT');
      expect(violation?.tier).toBe('forbidden');
      expect(violation?.reason).toContain('not one of the licenses this package offers');
    });

    it('blocks a misspelled election rather than accepting it', () => {
      expect(verdict('(MIT OR GPL-3.0-or-later)', 'MITT')?.tier).toBe('forbidden');
    });

    // An election resolves one choice; it must not discard a term that binds every branch.
    it('keeps a conjunct that binds every branch of an elected choice', () => {
      const violation = verdict('(MIT OR Apache-2.0) AND MPL-2.0', 'MIT');
      expect(violation?.tier).toBe('review');
      expect(violation?.reason).toContain('MPL');
    });
  });

  // Every conjunct of an AND binds us. An election settles the OR it belongs to, and must then pass
  // as that conjunct; it never stands in for the whole expression.
  describe('AND with a choice inside a conjunct', () => {
    it('blocks a restrictive conjunct beside an elected permissive choice', () => {
      const violation = verdict('GPL-3.0 AND (Apache-2.0 OR MIT)', 'MIT');
      expect(violation?.tier).toBe('forbidden');
      expect(violation?.reason).toContain('GPL copyleft');
    });

    it('blocks the same expression with no election', () => {
      expect(verdict('GPL-3.0 AND (Apache-2.0 OR MIT)')?.tier).toBe('forbidden');
    });

    it('permits an AND of permissive licenses', () => {
      expect(verdict('MIT AND BSD-3-Clause')).toBeUndefined();
    });

    it('permits a permissive conjunct beside an elected permissive choice', () => {
      expect(verdict('(MIT OR Apache-2.0) AND BSD-2-Clause', 'MIT')).toBeUndefined();
      expect(verdict('BSD-2-Clause AND (MIT OR Apache-2.0)', 'apache-2.0')).toBeUndefined();
    });

    it('demands an election for a choice inside a conjunct', () => {
      const violation = verdict('(MIT OR Apache-2.0) AND BSD-2-Clause');
      expect(violation?.tier).toBe('review');
      expect(violation?.reason).toContain('LICENSE_ELECTIONS');
    });

    it('blocks an election that is not an alternative of the choice', () => {
      const violation = verdict('(MIT OR Apache-2.0) AND BSD-2-Clause', 'BSD-2-Clause');
      expect(violation?.tier).toBe('forbidden');
      expect(violation?.reason).toContain('not one of the licenses this package offers');
    });

    it('blocks an election of the restrictive alternative inside a conjunct', () => {
      expect(verdict('MIT AND (ISC OR GPL-3.0)', 'GPL-3.0')?.tier).toBe('forbidden');
    });

    // SPDX: AND binds tighter than OR, so this is MIT OR (GPL-3.0 AND ISC).
    it('gives AND precedence over OR', () => {
      expect(verdict('MIT OR GPL-3.0 AND ISC', 'MIT')).toBeUndefined();
      expect(verdict('MIT OR GPL-3.0 AND ISC', 'GPL-3.0')?.reason).toContain('not one of the licenses');
      expect(verdict('MIT OR GPL-3.0 AND ISC', 'GPL-3.0 AND ISC')?.tier).toBe('forbidden');
    });

    it('accepts a compound election that matches an alternative', () => {
      expect(verdict('(MIT AND Zlib) OR GPL-3.0', 'MIT AND Zlib')).toBeUndefined();
    });

    it('sends a malformed expression to review', () => {
      for (const malformed of ['(MIT', 'MIT AND', 'MIT OR OR ISC', '()', '']) {
        expect(verdict(malformed)?.tier).toBe('review');
      }
    });
  });

  // A package that declares nothing reaches the gate as NOASSERTION unless its text was recognized.
  it('sends NOASSERTION to review', () => {
    const violation = verdict('NOASSERTION');
    expect(violation?.tier).toBe('review');
    expect(violation?.reason).toContain('declares no license');
  });

  it('permits a subject listed as a deliberate exception', () => {
    expect(findLicenseViolation('Old School RuneScape Wiki datasets', 'CC-BY-NC-SA-3.0')).toBeUndefined();
    expect(
      findLicenseViolation(
        'Mulberry32, by Tommy Ettinger, in the JavaScript form of bryc/code PRNGs.md',
        'Public domain',
      ),
    ).toBeUndefined();
    expect(findLicenseViolation('some-other-package', 'CC-BY-NC-SA-3.0')?.tier).toBe('forbidden');
  });

  // The subject name is typo- and attacker-controlled; the declaration is what
  // binds us.
  it('applies an exception only to the license it was granted for', () => {
    expect(findLicenseViolation('lightningcss', 'MPL-2.0')).toBeUndefined();
    expect(findLicenseViolation('lightningcss', 'AGPL-3.0')?.tier).toBe('forbidden');
    expect(findLicenseViolation('lightningcss-evil', 'AGPL-3.0')?.tier).toBe('forbidden');
    expect(findLicenseViolation('Old School RuneScape Wiki datasets', 'GPL-3.0')?.tier).toBe('forbidden');
    expect(findLicenseViolation('Old School RuneScape Wiki datasets', 'CC-BY-NC-4.0')?.tier).toBe('forbidden');
  });

  // npm resolves a different optional binary per host, so the acknowledgment has
  // to cover names this machine never installs or the build fails on another machine.
  it.each([
    'lightningcss',
    'lightningcss-linux-x64-gnu',
    'lightningcss-linux-x64-musl',
    'lightningcss-darwin-arm64',
    'lightningcss-win32-x64-msvc',
  ])('permits the acknowledged build-tool family member %s', (name) => {
    expect(findLicenseViolation(name, 'MPL-2.0')).toBeUndefined();
  });

  it('does not let the acknowledged family swallow an unrelated package', () => {
    expect(findLicenseViolation('lightning-fast-gpl-thing', 'MPL-2.0')?.tier).toBe('review');
    expect(findLicenseViolation('some-mpl-package', 'MPL-2.0')?.tier).toBe('review');
  });
});

describe('assertLicensePolicy', () => {
  it('passes a clean set', () => {
    expect(() =>
      assertLicensePolicy([
        { subject: 'a', declared: 'MIT' },
        { subject: 'b', declared: 'Apache-2.0' },
      ]),
    ).not.toThrow();
  });

  it('reports every violation at once rather than one per build', () => {
    let error: unknown;
    try {
      assertLicensePolicy([
        { subject: 'a', declared: 'MIT' },
        { subject: 'b', declared: 'GPL-3.0' },
        { subject: 'c', declared: 'AGPL-3.0' },
      ]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(RestrictiveLicenseError);
    expect((error as RestrictiveLicenseError).violations).toHaveLength(2);
    expect((error as Error).message).toContain('b is "GPL-3.0"');
    expect((error as Error).message).toContain('c is "AGPL-3.0"');
    expect((error as Error).message).toContain('ACKNOWLEDGED_SUBJECTS');
  });
});
