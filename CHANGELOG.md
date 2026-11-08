# Changelog

## 0.1.0-alpha.13

- React: each node's spoken name says its sex in words ("male", "female" or "sex unknown") instead of the host's raw value, which a screen reader read as a letter or skipped. Other host labels are spoken as written. The visible ♂/♀ is unchanged. New `Terminology` keys `male`, `female` and `sexUnknown` translate the words, and `sexWord` is exported. The Explorer quick view uses the same words.

## Mac app 0.3.0

- Mac app: saves are now atomic, so a crash can't leave a half-written project file.
- Mac app: uses the OneOrigin suite accent color.
- Mac app: error messages now say what to do next.
- Core: compiles without Node types, so it can't pick up Node-only code by accident.
- Documentation: architecture, invariants and this changelog. Names the OneOrigin suite.

## 0.1.0-alpha.12

- License: PolyForm Noncommercial 1.0.0. Earlier versions remain under MIT.
