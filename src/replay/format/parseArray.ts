import { z } from 'zod';

export function failFastReplayArray<Element>(
  element: z.ZodType<Element>,
  bounds: { readonly min?: number; readonly max?: number } = {},
) {
  return z.custom<unknown[]>(Array.isArray, 'Expected array').transform((entries, context) => {
    if (bounds.min !== undefined && entries.length < bounds.min) {
      context.addIssue({ code: 'too_small', origin: 'array', minimum: bounds.min, inclusive: true });
      return z.NEVER;
    }
    if (bounds.max !== undefined && entries.length > bounds.max) {
      context.addIssue({ code: 'too_big', origin: 'array', maximum: bounds.max, inclusive: true });
      return z.NEVER;
    }
    const parsed: Element[] = [];
    for (let index = 0; index < entries.length; index++) {
      const result = element.safeParse(entries[index]);
      if (!result.success) {
        for (const issue of result.error.issues) context.addIssue({ ...issue, path: [index, ...issue.path] });
        return z.NEVER;
      }
      parsed.push(result.data);
    }
    return parsed;
  });
}
