import type { Mesh3DCommand, RenderCommand } from '../../core/commands';

export interface Mesh3DBuckets {
  readonly opaque: Mesh3DCommand[];
  readonly sorted: Mesh3DCommand[];
  readonly transparent: Mesh3DCommand[];
  readonly noDepth: Mesh3DCommand[];
}

export function classifyMesh3DCommands(commands: readonly RenderCommand[]): Mesh3DBuckets {
  const opaque: Mesh3DCommand[] = [];
  const sorted: Mesh3DCommand[] = [];
  const transparent: Mesh3DCommand[] = [];
  const noDepth: Mesh3DCommand[] = [];

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    if (command.kind !== 'mesh3d') {
      continue;
    }

    if (command.depth === 'none') {
      noDepth.push(command);
      continue;
    }

    if (command.depth === 'sorted') {
      sorted.push(command);
      continue;
    }

    if (command.depth === 'read' || command.blend === 'normal') {
      transparent.push(command);
      continue;
    }

    opaque.push(command);
  }

  return { opaque, sorted, transparent, noDepth };
}
