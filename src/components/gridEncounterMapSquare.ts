import { encounterRegistry } from '../encounters/registry';

export function getMinimapMapSquare(encounterKind: string): { x: number; y: number } | undefined {
  return encounterRegistry.getDescriptorForKind(encounterKind)?.mapSquare;
}
