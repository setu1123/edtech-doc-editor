/**
 * A robust, lightweight implementation of fractional indexing using base-36 (0-9a-z).
 * This ensures that sorting position keys lexicographically yields the correct order.
 */

const BASE = 36;
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function generatePositionBetween(a: string | null, b: string | null): string {
  const min = a || "0";
  const max = b || "z";

  if (!a && !b) {
    return "m"; // Middle of base-36 space
  }

  if (!a) {
    // Generate key before b
    return getPredecessor(max);
  }

  if (!b) {
    // Generate key after a
    return getSuccessor(min);
  }

  // Generate key between a and b
  return getMidpoint(min, max);
}

function getPredecessor(val: string): string {
  // Simple subtraction / decrementing
  const chars = val.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = DIGITS.indexOf(chars[i]);
    if (idx > 0) {
      chars[i] = DIGITS[idx - 1];
      return chars.join("");
    } else {
      chars[i] = "0";
    }
  }
  return "0" + val;
}

function getSuccessor(val: string): string {
  const chars = val.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = DIGITS.indexOf(chars[i]);
    if (idx < BASE - 1) {
      chars[i] = DIGITS[idx + 1];
      return chars.join("");
    } else {
      chars[i] = "z";
    }
  }
  return val + "m";
}

function getMidpoint(low: string, high: string): string {
  // Pad strings to equal length for easy comparison
  const len = Math.max(low.length, high.length) + 1;
  const lowPad = low.padEnd(len, "0");
  const highPad = high.padEnd(len, "0");

  let mid = "";
  let carry = 0;

  for (let i = 0; i < len; i++) {
    const lVal = DIGITS.indexOf(lowPad[i]) + carry;
    const hVal = DIGITS.indexOf(highPad[i]);

    if (hVal < lVal) {
      // High string is smaller or equal at this position, pad/handle carry
      // Should not happen for valid inputs where low < high
    }

    const sum = lVal + hVal;
    const mIdx = Math.floor(sum / 2);
    mid += DIGITS[mIdx];

    if (sum % 2 !== 0) {
      carry = BASE;
    } else {
      carry = 0;
    }
  }

  // Remove trailing zeros to keep strings concise
  return mid.replace(/0+$/, "") || "m";
}
