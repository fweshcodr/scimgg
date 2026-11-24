export abstract class Entity {
  height: number = 1000;

  canMergeNormals(): boolean {
    return false;
  }

  mergeNormals(_entity: Entity, _offsetX: number, _offsetY: number, _offsetZ: number, _hideOccluded: boolean): void {}
}
