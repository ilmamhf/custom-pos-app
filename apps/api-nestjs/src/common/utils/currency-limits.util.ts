/**
 * Currency limits and validation utilities.
 *
 * Indonesian Rupiah (IDR) ceiling: 999,999,999 IDR (~$60,000 USD)
 * This is well within JavaScript's safe integer range (2^53 - 1 = 9,007,199,254,740,991)
 * but provides a reasonable business ceiling for retail transactions.
 */

export const IDR_CEILING = 999_999_999n; // ~$60,000 USD
export const IDR_CEILING_NUMBER = 999_999_999; // for Number-based validation

/**
 * Validates that a monetary value (in minor units) does not exceed the IDR ceiling.
 * Throws BadRequestException if the value exceeds the ceiling.
 */
export function validateIdrCeiling(value: bigint | number, fieldName: string): void {
  const numValue = typeof value === 'bigint' ? value : BigInt(value);
  if (numValue > IDR_CEILING) {
    const ceilingStr = Number(IDR_CEILING).toLocaleString('id-ID');
    throw new Error(`${fieldName} exceeds maximum allowed value of ${ceilingStr} IDR`);
  }
}

/**
 * Validates and converts a monetary value to BigInt, enforcing the IDR ceiling.
 */
export function toBigIntWithinCeiling(value: number | string | bigint, fieldName: string): bigint {
  const numValue = typeof value === 'bigint' ? value : BigInt(value);
  validateIdrCeiling(numValue, fieldName);
  return numValue;
}

/**
 * Type-safe IDR ceiling constant for use in class-validator @Max decorator.
 * Note: class-validator @Max only works with number, so we use the number representation.
 */
export const IDR_CEILING_MAX_DECORATOR = IDR_CEILING_NUMBER;