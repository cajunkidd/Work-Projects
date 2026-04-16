/**
 * Format a number as a currency string.
 * @param n - The number to format.
 * @param currency - ISO 4217 currency code (default: 'USD').
 */
export function fmt(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(n)
}
