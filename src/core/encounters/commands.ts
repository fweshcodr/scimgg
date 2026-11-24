import type { InfernoCommand } from '../../encounters/inferno/commands';
import type { SolHereditEncounterCommand } from '../../encounters/solHeredit/commands';
import type { YamaEncounterCommand } from '../../encounters/yamaP3/commands';
import type { ZukEncounterCommand } from '../../encounters/zuk/commands';

export type EncounterCommand = YamaEncounterCommand | ZukEncounterCommand | SolHereditEncounterCommand | InfernoCommand;
