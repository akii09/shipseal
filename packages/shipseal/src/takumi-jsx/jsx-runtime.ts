// Local four-line JSX runtime for Takumi templates (no React)
// Spec: docs/PROJECT_PLAN.md §16.2, §25 (S1)

export type JsxElement = {
  type: string | symbol | ((props: Record<string, unknown>) => unknown);
  props: Record<string, unknown> | null;
  key: string | null;
};

export function jsx(
  type: JsxElement["type"],
  props: Record<string, unknown> | null,
  key?: string | null,
): JsxElement {
  return { type, props, key: key ?? null };
}

export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = Symbol.for("takumi.fragment");

export namespace JSX {
  export type Element = JsxElement;
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  export type IntrinsicElements = Record<string, Record<string, unknown>>;
}
