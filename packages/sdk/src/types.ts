/** FXRP has six decimals, the same as XRP's drops. */
export const FXRP_DECIMALS = 6n;
export const FXRP_UNIT = 1_000_000n;

/** USD amounts throughout are fixed-point with eight decimals, matching FTSOv2. */
export const USD_SCALE = 100_000_000n;

export class CovenantError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CovenantError";
  }
}

/**
 * A rule refused this payment.
 *
 * Distinct from a failure: the system worked and said no. Callers should show
 * the reason rather than treat it as an outage.
 */
export class PolicyViolation extends CovenantError {
  constructor(
    message: string,
    readonly reason: string,
    readonly instructionTransaction?: `0x${string}`,
  ) {
    super(message);
    this.name = "PolicyViolation";
  }
}

/**
 * FCC accepted the on-chain instruction, but its off-chain execution failed.
 * The confirmed instruction remains useful evidence even though no vault
 * execution transaction could be submitted.
 */
export class FccInfrastructureError extends CovenantError {
  constructor(
    message: string,
    readonly instructionId: `0x${string}`,
    readonly instructionTransaction: `0x${string}`,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "FccInfrastructureError";
  }
}

/** Format 6dp FXRP for display. */
export function formatFxrp(amount: bigint): string {
  const whole = amount / FXRP_UNIT;
  const frac = (amount % FXRP_UNIT).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Parse a human FXRP amount into base units. */
export function parseFxrp(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new CovenantError(`"${amount}" is not an amount`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > 6) throw new CovenantError("FXRP has at most six decimal places");
  return BigInt(whole || "0") * FXRP_UNIT + BigInt(frac.padEnd(6, "0") || "0");
}

/** Format an 8dp USD figure. */
export function formatUsd(usd: bigint): string {
  const whole = usd / USD_SCALE;
  const cents = ((usd % USD_SCALE) / 1_000_000n).toString().padStart(2, "0");
  return `$${whole}.${cents}`;
}

/** Parse dollars into the contract's 8dp representation. */
export function parseUsd(usd: string): bigint {
  const trimmed = usd.trim().replace(/^\$/, "");
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new CovenantError(`"${usd}" is not an amount`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > 8) throw new CovenantError("USD has at most eight decimal places");
  return BigInt(whole || "0") * USD_SCALE + BigInt(frac.padEnd(8, "0") || "0");
}
