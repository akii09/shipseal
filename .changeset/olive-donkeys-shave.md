---
"shipseal": patch
---

Point the workflow in the README at a tag that exists. The npm page told everyone to pin the
action to a `v1` tag that was never created, so every workflow copied from it failed with
"unable to resolve action" before a single step ran. The reference now names the released
version, and CI fails when a documented reference does not resolve.
