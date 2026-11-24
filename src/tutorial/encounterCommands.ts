import type { EncounterCommand } from '../core/encounters/commands';
import {
  YAMA_SET_OPENING_MAGIC_COMMAND,
  YAMA_SET_OPENING_RANGE_COMMAND,
  YAMA_SPAWN_FIREBALL_COMMAND,
  YAMA_SPAWN_VOID_FLARE_COMMAND,
} from '../encounters/yamaP3/commands';

export type TutorialEncounterCommandId =
  | 'yama-opening-magic'
  | 'yama-opening-range'
  | 'yama-spawn-fireball'
  | 'yama-spawn-void-flare';

export function resolveTutorialEncounterCommand(commandId: TutorialEncounterCommandId): EncounterCommand {
  switch (commandId) {
    case 'yama-opening-magic':
      return YAMA_SET_OPENING_MAGIC_COMMAND;
    case 'yama-opening-range':
      return YAMA_SET_OPENING_RANGE_COMMAND;
    case 'yama-spawn-fireball':
      return YAMA_SPAWN_FIREBALL_COMMAND;
    case 'yama-spawn-void-flare':
      return YAMA_SPAWN_VOID_FLARE_COMMAND;
    default: {
      const exhaustive: never = commandId;
      return exhaustive;
    }
  }
}

export class TutorialEncounterCommandSetupError extends Error {
  readonly name = 'TutorialEncounterCommandSetupError';

  constructor(readonly commandId: TutorialEncounterCommandId) {
    super(commandId);
  }
}
