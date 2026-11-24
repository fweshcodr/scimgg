/**
 * The one place chat highlight colors resolve to hex, so the chat box can confirm or remap them.
 *
 * Current captures send the tags `@mes_hl_red@` and `@mes_hl_gre@` (L:3446, L:4701, L:4858). Older
 * captures sent the same lines with literal colors: `<col=ff3045>Sol Heredit jumps down from his
 * seat...` (K:163, M:17) and `<col=229628>You perfectly parry Sol Heredit's grapple!` (K:3538,
 * M:6123). PROVISIONAL: the tags are taken to resolve to those colors. Whether the client draws
 * them differently on a transparent chat box is unverified.
 */
export const CHAT_HIGHLIGHT_COLORS = {
  red: '#ff3045',
  green: '#229628',
} as const;
