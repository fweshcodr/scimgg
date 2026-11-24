import { resolve } from 'node:path';
import { resolveConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

const CONFIG_FILE = resolve(import.meta.dirname, 'vite.config.ts');

afterEach(() => {
  delete process.env.SCIM_DEV_LAN;
});

describe('Vite development server access', () => {
  it('enforces loopback-only access when CLI flags request a public listener', async () => {
    const config = await resolveConfig(
      {
        configFile: CONFIG_FILE,
        server: { host: '0.0.0.0', cors: true, allowedHosts: true },
      },
      'serve',
    );

    expect(config.server).toMatchObject({ host: '127.0.0.1', cors: false });
    expect(config.server.allowedHosts).not.toBe(true);
    expect(config.server.allowedHosts).toContain('localhost');
  });

  it('allows a restricted public listener only when LAN mode is explicit', async () => {
    process.env.SCIM_DEV_LAN = '1';

    const config = await resolveConfig({ configFile: CONFIG_FILE }, 'serve');

    expect(config.server).toMatchObject({ host: '0.0.0.0', cors: false });
    expect(config.server.allowedHosts).not.toBe(true);
    expect(config.server.allowedHosts).toContain('localhost');
  });
});
