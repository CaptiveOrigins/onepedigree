import type { Parentage, ParentKind, ParentReference } from './types'

/**
 * Whether a link passes on genes: no kind recorded (the default, as before kinds existed), `biological`, or `donor` (a
 * gamete donor is the genetic parent, even when someone else raised or gestated the young). Legal, adoptive, social and
 * any other kind don't.
 */
export const isBiologicalKind = (kind: ParentKind | null | undefined): boolean => kind === undefined || kind === null || kind === 'biological' || kind === 'donor'

/**
 * The parents every calculation uses: relatedness, siblings, kinship, inbreeding, mean kinship, gene diversity,
 * founders, inheritance and exports such as PMx. A link with no `kind`, `kind: 'biological'` or `kind: 'donor'` counts;
 * a legal, adoptive, social or any other kind of link doesn't. Callers that walk parents for a calculation go through
 * here, never `parentage.parents`, so none can forget the rule. Views that draw links as recorded read `parents`.
 *
 * Returns the recorded array itself when every link is biological, so documents without kinds cost nothing.
 */
export function biologicalParents(parentage: Pick<Parentage, 'parents'> | null | undefined): readonly ParentReference[] {
  const parents = parentage?.parents ?? []
  return parents.every((p) => isBiologicalKind(p.kind)) ? parents : parents.filter((p) => isBiologicalKind(p.kind))
}
