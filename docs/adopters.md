# Adopters

Projects running Shipseal on real releases. One row per repository, added when the workflow has
actually produced a pack, not when someone says they will try it.

Phase 4 sets the bar at **three external repositories before launch day**. That criterion is the
only demand check left after the validation gate was dropped (§25), so it is worth keeping honest:
this file is evidence, not a wish list.

| Repository | Since | What it generates | What broke |
|---|---|---|---|
| [akii09/shipseal](https://github.com/akii09/shipseal) | v0.0.2 | Release pack on every published release | Dogfooding found 8 bugs the test suite did not |

Add a row by opening a pull request. The "what broke" column matters more than the other three:
every entry there is a bug found by a repository that is not this one.

## Feedback from maintainers

Not adopters, and worth keeping anyway. A reasoned no tells you more than a vague yes, and these
are the only outside opinions the project has.

| Date | Who | Where | What they said |
|---|---|---|---|
| 2026-09-15 | stefan6419846 | [community/maintainers #887](https://github.com/community/maintainers/discussions/887) | Has never used release images. Writes hard facts and migration steps in text, and images never helped either as producer or consumer. Also: an image needs a plaintext description anyway, for accessibility |

### What the first reply changed

Two things came out of it, neither of them a bug:

1. **Accessibility is a real gap.** Shipseal writes images and no alt text. A maintainer who cares
   about accessibility has to hand-write a description for every card, which cancels the time the
   tool saves. The manifest already holds every fact the card shows, so alt text can be generated
   from the same source without a model. This is now the strongest feature idea the project has,
   and it came from someone who said he would never use the product.
2. **There is a segment that will never convert**, and it is not small: maintainers whose release
   notes are migration steps and hard facts. An image adds nothing there. Better to know it than to
   keep pitching them.
