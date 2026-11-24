import { describe, expect, it, vi } from 'vitest';
import { resolveTerminalDialog } from '../../../components/terminalDialog';
import { encounterRegistry } from '../../../encounters/registry';
import { YamaEncounter } from '../../../encounters/yamaP3/YamaEncounter';
import { type EncounterDescriptor, EncounterRegistry } from '../encounterFactory';

describe('EncounterRegistry', () => {
  it('registers and creates an encounter by kind', () => {
    const registry = new EncounterRegistry();
    registry.register('yama_p3', () => new YamaEncounter());

    const encounter = registry.create('yama_p3');
    expect(encounter).toBeInstanceOf(YamaEncounter);
    expect(encounter.kind).toBe('yama_p3');
  });

  it('throws a clear error when kind is unknown', () => {
    const registry = new EncounterRegistry();
    registry.register('yama_p3', () => new YamaEncounter());

    expect(() => registry.create('missing_kind')).toThrowError(
      "Unknown encounter kind: 'missing_kind'. Registered kinds: yama_p3",
    );
  });

  it('returns all registered encounter kinds', () => {
    const registry = new EncounterRegistry();
    registry.register('yama_p3', () => new YamaEncounter());
    registry.register('yama_p3_alt', () => new YamaEncounter());

    expect(registry.getRegisteredKinds()).toEqual(['yama_p3', 'yama_p3_alt']);
  });

  it.each([undefined, { invocation: 7 }])('forwards config %j unchanged when creating an encounter', (config) => {
    const registry = new EncounterRegistry();
    const factory = vi.fn((_config?: Record<string, unknown>) => new YamaEncounter());
    registry.register('yama_p3', factory);

    const encounter = registry.create('yama_p3', config);

    expect(factory).toHaveBeenCalledExactlyOnceWith(config);
    expect(factory.mock.calls[0]?.[0]).toBe(config);
    expect(encounter).toBeInstanceOf(YamaEncounter);
  });
});

describe('EncounterRegistry registration validation', () => {
  const descriptor: EncounterDescriptor = {
    kind: 'yama_p3_alt',
    displayName: 'Alternate Yama',
    description: 'Registration fixture',
    mapSquare: { x: 23, y: 157 },
    playerStart: [31, 37],
  };

  it.each([
    { originalDescriptor: true, replacementDescriptor: true },
    { originalDescriptor: true, replacementDescriptor: false },
    { originalDescriptor: false, replacementDescriptor: true },
    { originalDescriptor: false, replacementDescriptor: false },
  ])('preserves both maps when a duplicate key is rejected: %j', ({ originalDescriptor, replacementDescriptor }) => {
    const registry = new EncounterRegistry();
    const originalEncounter = new YamaEncounter();
    const original = originalDescriptor ? descriptor : undefined;
    const replacement = replacementDescriptor ? { ...descriptor, displayName: 'Replacement' } : undefined;
    const replacementFactory = vi.fn(() => new YamaEncounter());
    registry.register(descriptor.kind, () => originalEncounter, original);

    expect
      .soft(() => registry.register(descriptor.kind, replacementFactory, replacement))
      .toThrowError(expect.objectContaining({ name: 'DuplicateEncounterKindError', kind: descriptor.kind }));

    expect(registry.create(descriptor.kind)).toBe(originalEncounter);
    expect(registry.getDescriptor(descriptor.kind)).toBe(original);
    expect(registry.getRegisteredKinds()).toEqual([descriptor.kind]);
    expect(replacementFactory).not.toHaveBeenCalled();
  });

  it('leaves the new key absent and existing entries intact when descriptor.kind mismatches', () => {
    const registry = new EncounterRegistry();
    const originalEncounter = new YamaEncounter();
    registry.register(descriptor.kind, () => originalEncounter, descriptor);
    const factory = vi.fn(() => new YamaEncounter());

    expect
      .soft(() => registry.register('mini_lobby', factory, { ...descriptor, displayName: 'Replacement' }))
      .toThrowError(
        expect.objectContaining({
          name: 'EncounterDescriptorKindMismatchError',
          kind: 'mini_lobby',
          descriptorKind: descriptor.kind,
        }),
      );

    expect(registry.hasKind('mini_lobby')).toBe(false);
    expect(registry.getDescriptor('mini_lobby')).toBeUndefined();
    expect(registry.getRegisteredKinds()).toEqual([descriptor.kind]);
    expect(registry.create(descriptor.kind)).toBe(originalEncounter);
    expect(registry.getDescriptor(descriptor.kind)).toBe(descriptor);
    expect(factory).not.toHaveBeenCalled();
  });

  it('keeps the factory lazy when registering a matching descriptor', () => {
    const registry = new EncounterRegistry();
    const factory = vi.fn(() => new YamaEncounter());

    registry.register(descriptor.kind, factory, descriptor);

    expect(factory).not.toHaveBeenCalled();
    expect(registry.getDescriptor(descriptor.kind)).toBe(descriptor);
  });
});

describe('registered Yama descriptor', () => {
  it('provides typed static victory presentation metadata', () => {
    expect(encounterRegistry.getDescriptor('yama_p3')?.victory).toEqual({
      eyebrow: 'Triumphant',
      title: 'VICTORY',
      narrative: 'YAMA DEFEATED',
      accent: 'blood',
    });
  });
});

describe('registered Inferno descriptor (won on TzKal-Zuk)', () => {
  it('provides typed static victory presentation metadata', () => {
    expect(encounterRegistry.getDescriptor('inferno')?.victory).toEqual({
      eyebrow: 'Triumphant',
      title: 'VICTORY',
      narrative: 'TZKAL-ZUK DEFEATED',
      accent: 'gold',
    });
  });

  it('lets the arena mount the victory dialog for a completed Zuk fight, and nothing while it resolves', () => {
    const liveOutcome = {
      playerFailed: false,
      tutorialOwned: false,
      isReplaying: false,
      hasVictoryDescriptor: encounterRegistry.getDescriptorForKind('inferno')?.victory !== undefined,
    };

    expect(resolveTerminalDialog({ ...liveOutcome, outcomePhase: 'victory' })).toBe('victory');
    expect(resolveTerminalDialog({ ...liveOutcome, outcomePhase: 'resolving' })).toBe('none');
  });
});

describe('registered encounter outcomes and inherited victory metadata', () => {
  it.each(['lobby', 'yama_p3'])('%s starts with the shared active outcome', (kind) => {
    expect(encounterRegistry.create(kind).getOutcome()).toEqual({ phase: 'active' });
  });

  it('inherits parent Yama victory metadata for contract variants while lobby has none', () => {
    expect(encounterRegistry.getDescriptorForKind('yama_p3_divine')?.victory).toEqual({
      eyebrow: 'Triumphant',
      title: 'VICTORY',
      narrative: 'YAMA DEFEATED',
      accent: 'blood',
    });
    expect(encounterRegistry.getDescriptor('lobby')?.victory).toBeUndefined();
  });

  it('creates a descriptor-less variant while inheriting its parent descriptor', () => {
    const encounter = encounterRegistry.create('yama_p3_divine');

    expect(encounter.kind).toBe('yama_p3_divine');
    expect(encounterRegistry.getDescriptor('yama_p3_divine')).toBeUndefined();
    expect(encounterRegistry.getDescriptorForKind('yama_p3_divine')).toBe(encounterRegistry.getDescriptor('yama_p3'));
  });
});

describe('EncounterRegistry core descriptor storage', () => {
  it('stores descriptors without render-layer config', () => {
    const registry = new EncounterRegistry();
    registry.register('mini_lobby', () => new YamaEncounter(), {
      kind: 'mini_lobby',
      displayName: 'Mini Lobby',
      description: 'core-only descriptor',
      mapSquare: { x: 25, y: 73 },
      playerStart: [0, 0],
    });
    expect(registry.getDescriptor('mini_lobby')?.mapSquare).toEqual({ x: 25, y: 73 });
  });
});
