---
"shipseal": patch
---

Never present a private package as an npm package. A workspace root's name leaked into the
call to action, so a real release card read `npm i shipseal-monorepo`, a package that does not
exist. Projects with a private root now fall back to the repository URL.
