// Fixed decimal scale is the maximum ERC-20 decimals (255) plus 36 price decimals.
// Every accepted multiplication is exact. Display percentages are truncated to six places.
export const USD_DECIMALS = 291;
export const USD_SCALE = 10n ** BigInt(USD_DECIMALS);

export function decimal(value: string): bigint {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('invalid_decimal');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (fraction.length > USD_DECIMALS) throw new Error('decimal_precision_exceeded');
  const result = BigInt(whole) * USD_SCALE + BigInt(fraction.padEnd(USD_DECIMALS, '0'));
  return negative ? -result : result;
}

export function formatDecimal(value: bigint, places = USD_DECIMALS): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const fraction = (abs % USD_SCALE).toString().padStart(USD_DECIMALS, '0').slice(0, places).replace(/0+$/, '');
  return `${sign}${abs / USD_SCALE}${fraction ? `.${fraction}` : ''}`;
}

export function usdValue(raw: string, decimals: number, price: string): bigint {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('invalid_quantity');
  if (!/^\d+(?:\.\d{1,36})?$/.test(price) || decimal(price) <= 0n) throw new Error('invalid_price');
  return BigInt(raw) * decimal(price) / (10n ** BigInt(decimals));
}
