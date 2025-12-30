export type MacroState = "ok" | "pending" | "over";

export type MacroKey = "protein" | "carbs" | "fat";

export const MACRO_TOL_PCT: Record<MacroKey, number> = {
  protein: 0.15,
  carbs: 0.25,
  fat: 0.2,
};

export const MACRO_MIN_TOL: Record<MacroKey, number> = {
  protein: 0.15,
  carbs: 0.25,
  fat: 0.2,
};
export const ZERO_EPS = 1e-9;

export const norm0 = (n: number) => (Math.abs(n) < ZERO_EPS ? 0 : n);

export const getTol = (budget: number, macro: MacroKey, unitSize = 1) =>
  Math.max(budget * MACRO_TOL_PCT[macro], MACRO_MIN_TOL[macro] * unitSize);

export const getMacroState = (
  remaining: number,
  budget: number,
  macro: MacroKey,
  unitSize = 1
): MacroState => {
  const r = norm0(remaining);
  const tol = getTol(budget, macro, unitSize);
  if (r < -tol) return "over";
  if (Math.abs(r) <= tol) return "ok";
  return "pending";
};

export const macroStateColor: Record<MacroState, string> = {
  ok: "success.main",
  pending: "#FBC02D", // yellow
  over: "error.main",
};
