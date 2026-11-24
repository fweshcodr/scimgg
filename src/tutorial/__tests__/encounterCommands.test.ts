import { describe, expect, it } from 'vitest';
import {
  YAMA_SET_OPENING_MAGIC_COMMAND,
  YAMA_SET_OPENING_RANGE_COMMAND,
  YAMA_SPAWN_FIREBALL_COMMAND,
  YAMA_SPAWN_VOID_FLARE_COMMAND,
} from '../../encounters/yamaP3/commands';
import { resolveTutorialEncounterCommand, type TutorialEncounterCommandId } from '../encounterCommands';

describe('resolveTutorialEncounterCommand', () => {
  it.each([
    ['yama-opening-magic', YAMA_SET_OPENING_MAGIC_COMMAND],
    ['yama-opening-range', YAMA_SET_OPENING_RANGE_COMMAND],
    ['yama-spawn-fireball', YAMA_SPAWN_FIREBALL_COMMAND],
    ['yama-spawn-void-flare', YAMA_SPAWN_VOID_FLARE_COMMAND],
  ] as const satisfies readonly (readonly [
    TutorialEncounterCommandId,
    object,
  ])[])('resolves %s to its typed command DTO', (commandId, expected) => {
    expect(resolveTutorialEncounterCommand(commandId)).toEqual(expected);
  });
});
