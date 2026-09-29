import axios from 'axios';

const BASE_URL = 'https://qiospay.id';

export interface ProductFilter {
  produk?: string;
  kategori?: string;
}

export async function getProducts(filters: ProductFilter = {}, page = 1) {
  const response = await axios.get(`${BASE_URL}/admin/modules/mapping/harga/${page}/reseller`, {
    timeout: 15000,
  });

  let data = response.data;
  if (!Array.isArray(data)) {
    data = [];
  }

  if (filters.produk) {
    const q = filters.produk.toLowerCase();
    data = data.filter((item: any) => item.produk?.toLowerCase().includes(q));
  }

  if (filters.kategori) {
    const q = filters.kategori.toLowerCase();
    data = data.filter((item: any) => item.kategori?.toLowerCase().includes(q));
  }

  return { data, total: data.length, page };
}

export async function getCategories(page = 1, maxPages = 5) {
  const all = new Set<string>();

  for (let p = 1; p <= maxPages; p++) {
    try {
      const response = await axios.get(`${BASE_URL}/admin/modules/mapping/harga/${p}/reseller`, {
        timeout: 15000,
      });
      const items = response.data;
      if (!Array.isArray(items) || items.length === 0) break;
      for (const item of items) {
        if (item.produk) all.add(item.produk);
      }
    } catch {
      break;
    }
  }

  return [...all].sort();
}
