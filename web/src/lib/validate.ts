// Range checks for the number settings; each returns a message, or "" when the value is fine or empty.

const check = (value: string, min: number, max: number | undefined, whole: boolean, range: string) => {
  if (!value.trim()) return "";
  const n = Number(value);
  const ok = Number.isFinite(n) && n >= min && (max === undefined || n <= max) && (!whole || Number.isInteger(n));
  return ok ? "" : range;
};

export const temperatureError = (v: string) => check(v, 0, 2, false, "Enter a number from 0 to 2.");
export const maxTokensError = (v: string) => check(v, 1, undefined, true, "Enter a whole number of 1 or more.");
export const maxScoreLevelsError = (v: string) => check(v, 2, 64, true, "Enter a whole number from 2 to 64.");
