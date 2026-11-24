export type SolHereditEncounterCommand =
  | { readonly encounter: 'sol_heredit'; readonly type: 'spawn-crystal' }
  | { readonly encounter: 'sol_heredit'; readonly type: 'trigger-grapple' }
  | { readonly encounter: 'sol_heredit'; readonly type: 'trigger-triple' }
  | { readonly encounter: 'sol_heredit'; readonly type: 'strike-sand' }
  | { readonly encounter: 'sol_heredit'; readonly type: 'clear-sand' };

export const SOL_HEREDIT_DEBUG_ACTIONS = [
  { command: { encounter: 'sol_heredit', type: 'trigger-grapple' }, label: 'Trigger grapple' },
  { command: { encounter: 'sol_heredit', type: 'trigger-triple' }, label: 'Trigger triple attack' },
  { command: { encounter: 'sol_heredit', type: 'spawn-crystal' }, label: 'Add beam crystal' },
  { command: { encounter: 'sol_heredit', type: 'strike-sand' }, label: 'Strike molten sand' },
  { command: { encounter: 'sol_heredit', type: 'clear-sand' }, label: 'Clear molten sand' },
] as const satisfies readonly { readonly command: SolHereditEncounterCommand; readonly label: string }[];
