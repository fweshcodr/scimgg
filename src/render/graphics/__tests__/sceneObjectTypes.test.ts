import { describe, expect, it } from 'vitest';

import {
  resolveSceneObjectPolicy,
  SCENE_OBJECT_CLASSIFICATIONS,
  type SceneObjectClassification,
  type SceneObjectSpec,
} from '../sceneObjectTypes';

describe('resolveSceneObjectPolicy', () => {
  it('Given a ground decal without explicit style When resolving policy Then it defaults to positive depth bias', () => {
    const spec = makeSpec({ classification: 'groundDecal' });

    const policy = resolveSceneObjectPolicy(spec);

    expect(policy.depthBias).toBeGreaterThan(0);
  });

  it('Given a scene mesh without explicit style When resolving policy Then it does not add depth bias', () => {
    const spec = makeSpec({ classification: 'sceneMesh' });

    const policy = resolveSceneObjectPolicy(spec);

    expect(policy.depthBias).toBeUndefined();
  });

  it('Given an aerial object with zOffset When resolving policy Then it anchors with the zOffset', () => {
    const spec = makeSpec({ classification: 'aerial', style: { zOffset: 1.75 } });

    const policy = resolveSceneObjectPolicy(spec);

    expect(policy.zOffset).toBe(1.75);
  });

  it('Given every classification When resolving policy Then the exhaustive seam handles each one', () => {
    const classifications = SCENE_OBJECT_CLASSIFICATIONS satisfies readonly SceneObjectClassification[];
    const policies = SCENE_OBJECT_CLASSIFICATIONS.map((classification) =>
      resolveSceneObjectPolicy(makeSpec({ classification })),
    );

    expect(classifications).toEqual(['groundDecal', 'sceneMesh', 'aerial']);
    expect(policies).toHaveLength(3);
  });
});

function makeSpec(
  overrides: Pick<SceneObjectSpec, 'classification'> & Pick<Partial<SceneObjectSpec>, 'style'>,
): SceneObjectSpec {
  return {
    id: 'test-object',
    meshId: 'test-mesh',
    materialId: 'test-material',
    modelMatrix: new Float32Array(16),
    lifecycle: { kind: 'sync' },
    classification: overrides.classification,
    style: overrides.style,
    data: { source: 'test' },
  } satisfies SceneObjectSpec<{ readonly source: string }>;
}
