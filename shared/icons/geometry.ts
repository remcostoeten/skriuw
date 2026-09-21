export type Clip = { readonly d: string; readonly rule: "nonzero" | "evenodd" };

/** One moving piece of an animated glyph, as the adapters draw it. */
export type AnimatedPart = {
  readonly id: string;
  readonly d: string;
  /** Moves with the part: the slice of the glyph it owns. */
  readonly clip?: Clip;
  /** Fixed to the parent frame: the opening the part is seen through. */
  readonly window?: Clip;
  /** Id of the part whose transform this one is drawn inside. */
  readonly within?: string;
  /** Shape that hides this part, moving with the part named by `follows`. */
  readonly occluder?: { readonly follows: string; readonly d: string };
  readonly hidden?: "opacity" | "window" | "occluder";
};

export type AnimatedGeometry = {
  readonly glyph: string;
  readonly parts: readonly AnimatedPart[];
};
