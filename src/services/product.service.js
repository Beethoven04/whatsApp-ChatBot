/**
 * Product Service — data layer for the fashion store catalog.
 *
 * SWAPPING TO SHOPIFY API
 * -----------------------
 * 1. Install: npm install @shopify/shopify-api
 * 2. Replace the `import productsData` and `let catalog` section with a
 *    Shopify client initialisation, e.g.:
 *
 *      import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
 *      const shopify = shopifyApi({ apiKey, apiSecretKey, hostName, ... });
 *      const client  = new shopify.clients.Rest({ session });
 *
 * 3. In `getAllProducts()`, call the Storefront/Admin REST endpoint:
 *      GET /admin/api/2024-01/products.json?limit=250
 *    Map the response to the same shape this module already returns:
 *      { product_id, name, gender, category, price, currency, size_options,
 *        color_options, material, care_instructions, style_tags,
 *        description, stock_quantity }
 *    Fields to map:
 *      product.title              → name
 *      product.product_type       → category
 *      product.variants[0].price  → price
 *      product.tags (comma str)   → style_tags (split & trim)
 *      variant.inventory_quantity → stock_quantity
 *      variant.option1            → size_options
 *      variant.option2            → color_options
 *
 * 4. `searchProducts()` and `getProductById()` need NO changes — they work
 *    on whatever `getAllProducts()` returns.
 *
 * 5. Add caching (node-cache / Redis) so every message doesn't hit Shopify.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '../../data/products.json');

let catalog = null;

/**
 * Loads (and caches) the product catalog from the JSON file.
 * @returns {Array<Object>}
 */
function loadCatalog() {
  if (!catalog) {
    catalog = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  }
  return catalog;
}

/**
 * Returns every product in the catalog.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllProducts() {
  return loadCatalog();
}

/**
 * Finds a single product by its ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getProductById(id) {
  const products = loadCatalog();
  return products.find((p) => p.product_id === id) ?? null;
}

/**
 * Keyword search across name, category, material, and style_tags.
 * Returns an empty array when nothing matches.
 * @param {string} query - Raw text from the customer message
 * @returns {Promise<Array<Object>>}
 */
export async function searchProducts(query) {
  if (!query || typeof query !== 'string') return [];

  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return [];

  const products = loadCatalog();

  const scored = products
    .map((product) => {
      const haystack = [
        product.name,
        product.gender,
        product.category,
        product.material,
        ...(product.style_tags ?? []),
        ...(product.color_options ?? []),
        ...(product.size_options ?? []),
        product.description,
      ]
        .join(' ')
        .toLowerCase();

      const hits = words.filter((w) => haystack.includes(w)).length;
      return { product, hits };
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits);

  return scored.map(({ product }) => product);
}
