export const NAME = "John";

export function generatePurchases(amount = 1000) {
  return Array.from({ length: amount }, (_, i) => ({
    name: `Purchase number ${i + 1}`,
    price: i * 2,
    quantity: i * 5,
  }));
}

export const PURCHASES = generatePurchases();
