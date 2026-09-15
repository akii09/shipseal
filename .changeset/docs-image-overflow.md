---
"shipseal": patch
---

Card images on the documentation site no longer overflow their column.

A rendered card is 1200 pixels wide or more, and the images carried only a width attribute, so on
a narrower column the right edge was cropped and the page scrolled sideways. The docs layout now
constrains every image it wraps.
