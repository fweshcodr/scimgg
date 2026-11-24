import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('No CommonJS require() statements', () => {
  it('should not have any require() calls in src/ TypeScript files', () => {
    const srcDir = path.join(process.cwd(), 'src');
    const requirePattern = /require\s*\(/g;
    const filesWithRequire: string[] = [];

    function scanDirectory(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name.endsWith('.test.ts') ||
          entry.name.endsWith('.test.tsx')
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('//')) {
              continue;
            }
            if (line.includes('/*') || line.includes('*/')) {
              continue;
            }

            if (requirePattern.test(line)) {
              const relativePath = path.relative(srcDir, fullPath);
              filesWithRequire.push(`${relativePath}:${i + 1} - ${line.trim()}`);
            }
          }

          requirePattern.lastIndex = 0;
        }
      }
    }

    scanDirectory(srcDir);

    if (filesWithRequire.length > 0) {
      const errorMessage =
        'Found CommonJS require() statements in the following files:\n' +
        filesWithRequire.map((f) => `  - ${f}`).join('\n') +
        '\n\nPlease convert to ES6 imports:\n' +
        "  ❌ const { X } = require('module');\n" +
        "  ✅ import { X } from 'module';";

      expect(filesWithRequire, errorMessage).toHaveLength(0);
    }
  });
});
