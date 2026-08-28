import {
  categories,
  products,
  type Category,
  type CategorySlug,
  type Product,
} from "@/content/products";

export const getCategory = (slug: string): Category | undefined =>
  categories.find((category) => category.slug === slug);

export const getProductsIn = (slug: CategorySlug): Product[] =>
  products.filter((product) => product.category === slug);

export const getProduct = (
  category: string,
  product: string,
): Product | undefined =>
  products.find((p) => p.category === category && p.slug === product);

export const allProductPaths = (): { category: string; product: string }[] =>
  products.map((product) => ({
    category: product.category,
    product: product.slug,
  }));

/** Sibling products in the same category, excluding the one given. */
export const getSiblings = (product: Product): Product[] =>
  getProductsIn(product.category).filter((p) => p.slug !== product.slug);
