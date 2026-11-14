// Exact, JSON-safe rational time. Values/timebases are integer strings, not floats.
const integer = (v) => {
  if (typeof v === "number" && !Number.isSafeInteger(v))
    throw Error("Unsafe time integer");
  if (!/^-?\d+$/.test(String(v))) throw Error("Expected an integer time");
  return BigInt(v);
};
const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1n;
};
/** @param {number|string|bigint} value @param {number|string|bigint} [rate] */
export function time(value, rate = 1) {
  let n = integer(value),
    d = integer(rate);
  if (d <= 0n) throw Error("Timebase must be positive");
  const g = gcd(n, d);
  return { value: String(n / g), rate: String(d / g) };
}
export function seconds(t) {
  const n = integer(t.value),
    d = integer(t.rate);
  if (d <= 0n) throw Error("Timebase must be positive");
  const a = Number(n),
    b = Number(d);
  if (Number.isFinite(a) && Number.isFinite(b)) return a / b;
  const sign = n < 0n ? -1 : 1,
    abs = n < 0n ? -n : n;
  if (!abs) return 0;
  const shiftN = Math.max(0, abs.toString(2).length - 53),
    shiftD = Math.max(0, d.toString(2).length - 53);
  return (
    sign *
    (Number(abs >> BigInt(shiftN)) / Number(d >> BigInt(shiftD))) *
    2 ** (shiftN - shiftD)
  );
}
const floatBits = new DataView(new ArrayBuffer(8));
export function fromSeconds(n) {
  if (!Number.isFinite(n) || Math.abs(n) > 86400 * 365)
    throw Error("Invalid time in seconds");
  if (n === 0) return time(0);
  // Preserve the input double exactly; rounding to nanoseconds can invalidate a one-frame clip.
  floatBits.setFloat64(0, n);
  const bits = floatBits.getBigUint64(0),
    exponent = Number((bits >> 52n) & 2047n);
  let mantissa = bits & ((1n << 52n) - 1n);
  if (exponent) mantissa |= 1n << 52n;
  if (bits >> 63n) mantissa = -mantissa;
  const shift = (exponent ? exponent - 1023 : -1022) - 52;
  return shift >= 0
    ? time(mantissa << BigInt(shift))
    : time(mantissa, 1n << BigInt(-shift));
}
export function rate(value) {
  if (typeof value === "object" && value) {
    if (integer(value.numerator) <= 0n || integer(value.denominator) <= 0n)
      throw Error("Invalid frame/sample rate");
    return {
      numerator: String(integer(value.numerator)),
      denominator: String(integer(value.denominator)),
    };
  }
  const [n, d = "1"] = String(value).split("/");
  if (integer(n) <= 0n || integer(d) <= 0n)
    throw Error("Invalid frame/sample rate");
  return { numerator: String(integer(n)), denominator: String(integer(d)) };
}
export function fromFrames(frames, fps) {
  const r = rate(fps);
  return time(integer(frames) * integer(r.denominator), r.numerator);
}
export function add(a, b) {
  return time(
    integer(a.value) * integer(b.rate) + integer(b.value) * integer(a.rate),
    integer(a.rate) * integer(b.rate),
  );
}
export function subtract(a, b) {
  return add(a, time(-integer(b.value), b.rate));
}
export function multiply(a, n, d = 1) {
  return time(integer(a.value) * integer(n), integer(a.rate) * integer(d));
}
export function compare(a, b) {
  const diff =
    integer(a.value) * integer(b.rate) - integer(b.value) * integer(a.rate);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}
export function frameIndex(t, fps, rounding = "nearest") {
  const r = rate(fps);
  let n = integer(t.value) * integer(r.numerator),
    d = integer(t.rate) * integer(r.denominator);
  const sign = n < 0n ? -1n : 1n;
  n = n < 0n ? -n : n;
  if (!["nearest", "floor", "ceil"].includes(rounding))
    throw Error("Unknown rounding");
  const q = n / d,
    rem = n % d;
  return String(
    sign *
      (q +
        (rounding === "nearest" && rem * 2n >= d
          ? 1n
          : rem &&
              ((rounding === "ceil" && sign > 0n) ||
                (rounding === "floor" && sign < 0n))
            ? 1n
            : 0n)),
  );
}
export const snapSeconds = (s, fps) =>
  seconds(fromFrames(frameIndex(fromSeconds(s), fps), fps));
export function canonicalize(project) {
  const p = structuredClone(project);
  p.timeSchemaVersion = 1;
  for (const c of p.clips ?? []) {
    const previous = c.timing ?? {};
    c.timing = {};
    for (const key of ["start", "in", "duration"]) {
      const t = previous[key];
      const exact =
        t && seconds(t) === c[key]
          ? time(t.value, t.rate)
          : (() => {
              const candidate =
                Number.isFinite(p.fps) && p.fps > 0
                  ? fromFrames(Math.round(c[key] * p.fps), p.fps)
                  : fromSeconds(c[key]);
              return seconds(candidate) === c[key]
                ? candidate
                : fromSeconds(c[key]);
            })();
      c.timing[key] = exact;
      c[key] = seconds(exact);
    }
  }
  return p;
}
export function assertTiming(project) {
  if (
    project.timeSchemaVersion !== undefined &&
    project.timeSchemaVersion !== 1
  )
    throw Error("Unsupported exact-time schema");
  for (const c of project.clips ?? []) {
    if (!c.timing) continue;
    for (const key of ["start", "in", "duration"]) {
      const t = c.timing[key];
      if (!t || !Number.isFinite(seconds(t)) || seconds(t) !== c[key])
        throw Error(
          `Clip ${c.id} has conflicting ${key} timing; update through typed operations or regenerate its seconds projection`,
        );
      if (compare(t, time(0)) < 0) throw Error("Clip time must be nonnegative");
    }
  }
  return project;
}
const clipTime = (clip, key) => {
  const t = clip.timing?.[key];
  return t && seconds(t) === clip[key] ? t : fromSeconds(clip[key]);
};
export function sourceAt(clip, timeline) {
  return add(clipTime(clip, "in"), subtract(timeline, clipTime(clip, "start")));
}
export function timelineAt(clip, source) {
  return add(clipTime(clip, "start"), subtract(source, clipTime(clip, "in")));
}
