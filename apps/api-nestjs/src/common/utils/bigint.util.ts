// Global BigInt JSON serialization utility
export function configureBigIntSerialization(): void {
  if (typeof (BigInt.prototype as any).toJSON !== 'function') {
    (BigInt.prototype as any).toJSON = function (): number | string {
      const num = Number(this);
      if (Number.isSafeInteger(num)) {
        return num;
      }
      return this.toString();
    };
  }
}

export function serializeBigIntDeep<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    const num = Number(value);
    return (Number.isSafeInteger(num) ? num : value.toString()) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigIntDeep(item)) as unknown as T;
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeBigIntDeep(v);
    }
    return result as T;
  }
  return value;
}
