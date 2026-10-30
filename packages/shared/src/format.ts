// Catalog prices are stored in USD; every client shows an approximate rupee figure.
export function inr(usd: number) {
  return `₹${(usd * 80).toLocaleString("en-IN")}`;
}
