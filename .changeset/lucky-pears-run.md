---
"shipseal": patch
---

Never put a truncated headline on a card. Taking the first sentence of a changelog entry was
not enough on its own: a single long sentence still overflowed, and one release shipped a hero
card cut off mid-phrase. Shipseal now picks the first entry whose opening sentence fits, and
titles the card with the project name and version when nothing is short enough.
