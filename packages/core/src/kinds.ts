import type { Parentage, ParentKind, ParentReference } from './types'

/** Whether a link's kind is biological: no kind recorded (the default, as before kinds existed) or `biological`. */
export const isBiologicalKind = (kind: ParentKind | null | undefined): boolean => kind === undefined || kind === null || kind === 'biological'

/**
 * The parents every calculation uses: relatedness, siblings, kinship, inbreeding, mean kinship, gene diversity,
 * founders, inheritance and exports such as PMx. A link with no `kind`, or `kind: 'biological'`, counts; a legal,
 * adoptive, social, donor or any other kind of link doesn't. Callers that walk parents for a calculation go through
 * here, never `parentage.parents`, so none can forget the rule. Views that draw links as recorded read `parents`.
 *
 * Returns the recorded array itself when every link is biological, so documents without kinds cost nothing.
 */
export function biologicalParents(parentage: Pick<Parentage, 'parents'> | null | undefined): readonly ParentReference[] {
  const parents = parentage?.parents ?? []
  return parents.every((p) => isBiologicalKind(p.kind)) ? parents : parents.filter((p) => isBiologicalKind(p.kind))
}
