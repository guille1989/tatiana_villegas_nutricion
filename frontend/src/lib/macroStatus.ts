export type MacroState = "ok" | "pending" | "over";

export const TOL_PCT = 0.05;
export const MIN_TOL = 0.3;
export const ZERO_EPS = 1e-9;

export const norm0 = (n: number) => (Math.abs(n) < ZERO_EPS ? 0 : n);

export const getTol = (budgetPortions: number) =>
  Math.max(budgetPortions * TOL_PCT, MIN_TOL);

export const getMacroState = (
  remainingPortions: number,
  budgetPortions: number
): MacroState => {
  const r = norm0(remainingPortions);
  const tol = getTol(budgetPortions);
  if (r < -tol) return "over";
  if (Math.abs(r) <= tol) return "ok";
  return "pending";
};

export const macroStateColor: Record<MacroState, string> = {
  ok: "success.main",
  pending: "#FBC02D", // yellow
  over: "error.main",
};
