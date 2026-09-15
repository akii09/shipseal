// The file access brand detection needs, as a port rather than a filesystem call.
//
// Detection is the most valuable thing Shipseal does before it renders anything: it finds a
// project's colors in its CSS, its Tailwind theme or its design tokens. It was reachable only
// from the CLI, because it called readdir and readFile directly. Every card on /try therefore
// rendered in Shipseal's own palette, which is the opposite of the promise the page makes.
//
// With the reads behind this interface the same detection runs over a checkout on disk or over
// a repository on GitHub, and there is one implementation to keep correct.

export interface ProjectFiles {
  /** Every candidate path, repository relative, already pruned of vendored directories. */
  list(): Promise<string[]>;
  /** Text at a repository relative path, or undefined when it is absent or unreadable. */
  read(path: string): Promise<string | undefined>;
  /** Bytes at a repository relative path. Used for PNG logo color extraction. */
  readBinary(path: string): Promise<Uint8Array | undefined>;
  /** Origin remote URL, where one exists. Absent for sources that are not a checkout. */
  gitRemote?(): Promise<string | undefined>;
}
