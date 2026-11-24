import { describe, expect, it } from 'vitest';
import type { Mesh3DCommand } from '../../../core/commands';
import { classifyMesh3DCommands } from '../commandClassifier';

const baseCommand = (id: string, overrides: Partial<Mesh3DCommand> = {}): Mesh3DCommand => ({
  kind: 'mesh3d',
  meshId: id,
  materialId: `${id}-material`,
  modelMatrix: new Float32Array(16),
  ...overrides,
});

describe('classifyMesh3DCommands', () => {
  it('routes opaque commands when depth is readwrite and blend is default', () => {
    const opaque = baseCommand('opaque');

    const buckets = classifyMesh3DCommands([opaque]);

    expect(buckets.opaque).toEqual([opaque]);
    expect(buckets.sorted).toEqual([]);
    expect(buckets.transparent).toEqual([]);
    expect(buckets.noDepth).toEqual([]);
  });

  it('routes sorted commands before transparency checks', () => {
    const sorted = baseCommand('sorted', { depth: 'sorted', blend: 'normal' });

    const buckets = classifyMesh3DCommands([sorted]);

    expect(buckets.opaque).toEqual([]);
    expect(buckets.sorted).toEqual([sorted]);
    expect(buckets.transparent).toEqual([]);
    expect(buckets.noDepth).toEqual([]);
  });

  it('routes transparent commands when blend is normal or depth is read', () => {
    const blendNormal = baseCommand('blend-normal', { blend: 'normal' });
    const depthRead = baseCommand('depth-read', { depth: 'read' });

    const buckets = classifyMesh3DCommands([blendNormal, depthRead]);

    expect(buckets.opaque).toEqual([]);
    expect(buckets.sorted).toEqual([]);
    expect(buckets.transparent).toEqual([blendNormal, depthRead]);
    expect(buckets.noDepth).toEqual([]);
  });

  it('routes no-depth commands ahead of all other bucket checks', () => {
    const noDepth = baseCommand('no-depth', { depth: 'none', blend: 'normal' });

    const buckets = classifyMesh3DCommands([noDepth]);

    expect(buckets.opaque).toEqual([]);
    expect(buckets.sorted).toEqual([]);
    expect(buckets.transparent).toEqual([]);
    expect(buckets.noDepth).toEqual([noDepth]);
  });

  it('preserves stable input order within each bucket', () => {
    const firstOpaque = baseCommand('opaque-1');
    const secondOpaque = baseCommand('opaque-2');
    const firstSorted = baseCommand('sorted-1', { depth: 'sorted' });
    const secondSorted = baseCommand('sorted-2', { depth: 'sorted' });

    const buckets = classifyMesh3DCommands([secondSorted, firstOpaque, secondOpaque, firstSorted]);

    expect(buckets.sorted).toEqual([secondSorted, firstSorted]);
    expect(buckets.opaque).toEqual([firstOpaque, secondOpaque]);
  });
});
