// Small, well-known fire-engineering formulas used by the advisor and the deck checks.

const RHO = 1.204; // kg/m3, air at 20 °C
const CP = 1.005; // kJ/(kg·K)
const G = 9.81; // m/s2

/** Characteristic fire diameter D* = (Q / (ρ∞ cp T∞ √g))^(2/5), Q in kW, result in m. */
export function characteristicDiameter(hrrKw: number, ambientC = 20): number {
  const tInf = ambientC + 273.15;
  const rho = (RHO * 293.15) / tInf; // ideal gas at constant pressure
  return Math.pow(hrrKw / (rho * CP * tInf * Math.sqrt(G)), 0.4);
}

/** Largest prime factor of n (n ≥ 1). */
export function largestPrimeFactor(n: number): number {
  let x = Math.floor(Math.abs(n));
  if (x < 2) return x;
  let p = 2;
  let largest = 1;
  while (p * p <= x) {
    while (x % p === 0) {
      largest = p;
      x /= p;
    }
    p++;
  }
  return x > 1 ? x : largest;
}

/** Is n a product of 2, 3 and 5 only? */
export function isFftFriendly(n: number): boolean {
  return n >= 1 && largestPrimeFactor(n) <= 5;
}

/** Nearest 2·3·5-smooth integer to n (ties go up). */
export function nearestFftFriendly(n: number): number {
  const target = Math.max(1, Math.round(n));
  for (let d = 0; d < target + 10; d++) {
    if (isFftFriendly(target + d)) return target + d;
    if (target - d >= 1 && isFftFriendly(target - d)) return target - d;
  }
  return target;
}

export type Box = [number, number, number, number, number, number];

export function boxVolume(b: Box): number {
  return Math.max(0, b[1] - b[0]) * Math.max(0, b[3] - b[2]) * Math.max(0, b[5] - b[4]);
}

export function boxesOverlap(a: Box, b: Box, eps = 1e-9): boolean {
  return a[0] < b[1] - eps && b[0] < a[1] - eps && a[2] < b[3] - eps && b[2] < a[3] - eps && a[4] < b[5] - eps && b[4] < a[5] - eps;
}

/** Is box/plane/point a fully inside the union bounding of b (closed)? */
export function boxInside(a: Box, b: Box, eps = 1e-6): boolean {
  return a[0] >= b[0] - eps && a[1] <= b[1] + eps && a[2] >= b[2] - eps && a[3] <= b[3] + eps && a[4] >= b[4] - eps && a[5] <= b[5] + eps;
}

/** Does a touch or intersect b (closed boxes)? */
export function boxTouches(a: Box, b: Box, eps = 1e-6): boolean {
  return a[0] <= b[1] + eps && b[0] <= a[1] + eps && a[2] <= b[3] + eps && b[2] <= a[3] + eps && a[4] <= b[5] + eps && b[4] <= a[5] + eps;
}
