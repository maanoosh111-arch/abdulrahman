import { InternalProduct, PublicProduct } from '../types.ts';

export const DEFAULT_SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID || '1YE4in7SBDTqpSRGgA3hLPBl28oiepByUE-Gtm4OR62c';
export const SECONDARY_SPREADSHEET_ID = '162KR2mqrF3fW3NIMxdcG1YZcMlJziDtSEKNXk_oBJio';
export const WORKSHEET_NAME = 'Sheet1';

interface CacheEntry {
  products: InternalProduct[];
  fetchedAt: number;
  sheetId: string;
}

const CACHE_TTL_MS = 5 * 1000; // 5 seconds fast revalidation period
let cachedData: CacheEntry | null = null;
let activeSheetId: string = DEFAULT_SPREADSHEET_ID;

// Optional runtime overrides used ONLY during automated verification tests to simulate owner edits in Google Sheets
const profitTestOverrides = new Map<string, number | null>();

export function setActiveSpreadsheetId(sheetId: string) {
  if (sheetId && sheetId.trim()) {
    activeSheetId = sheetId.trim();
    cachedData = null;
  }
}

export function getActiveSpreadsheetId(): string {
  return activeSheetId;
}

export function clearSheetCache() {
  cachedData = null;
}

export function setProductProfitOverride(productNameOrId: string, profit: number | null) {
  profitTestOverrides.set(productNameOrId.trim().toLowerCase(), profit);
}

export function clearProductProfitOverrides() {
  profitTestOverrides.clear();
}

/**
 * Parses numeric monetary values safely whether stored as numbers or numeric strings.
 * Returns null if empty, missing, or invalid.
 */
export function parseMonetaryNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && !Number.isNaN(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Normalize Arabic-Indic digits if any and strip currency symbols/commas
    const normalizedDigits = trimmed.replace(/[٠-٩]/g, (d) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    );
    const cleaned = normalizedDigits.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parses standard RFC-4180 CSV content into a 2D array of strings.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const nextCh = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && nextCh === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (ch === '\r' && nextCh === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Resolves header column indices dynamically by exact column names (case-insensitive):
 * Category | Product Name | Price | Profit | Description | Image URL
 */
export interface HeaderColumnMap {
  categoryIdx: number;
  nameIdx: number;
  priceIdx: number;
  profitIdx: number;
  descriptionIdx: number;
  imageIdx: number;
}

export function resolveHeaderColumns(headers: string[]): HeaderColumnMap | null {
  const normalized = headers.map((h) => (h || '').trim().toLowerCase());

  const categoryIdx = normalized.findIndex(
    (h) => h === 'category' || h === 'القسم' || h === 'التصنيف' || h === 'الفئة'
  );
  const nameIdx = normalized.findIndex(
    (h) =>
      h === 'product name' ||
      h === 'name' ||
      h === 'اسم المنتج' ||
      h === 'المنتج' ||
      h === 'اسم الصنف'
  );
  const priceIdx = normalized.findIndex(
    (h) => h === 'price' || h === 'السعر' || h === 'سعر'
  );
  const profitIdx = normalized.findIndex(
    (h) => h === 'profit' || h === 'الربح' || h === 'هامش الربح'
  );
  const descriptionIdx = normalized.findIndex(
    (h) => h === 'description' || h === 'الوصف' || h === 'تفاصيل' || h === 'وصف'
  );
  const imageIdx = normalized.findIndex(
    (h) =>
      h === 'image url' ||
      h === 'image' ||
      h === 'imageurl' ||
      h === 'الصورة' ||
      h === 'رابط الصورة' ||
      h === 'url'
  );

  if (categoryIdx === -1 || nameIdx === -1 || priceIdx === -1) {
    return null;
  }

  return {
    categoryIdx,
    nameIdx,
    priceIdx,
    profitIdx,
    descriptionIdx,
    imageIdx,
  };
}

/**
 * Generates a deterministic, URL-safe product ID from category and product name.
 */
export function buildProductId(category: string, name: string, rowIndex: number): string {
  const base = `${category.trim()}__${name.trim()}`
    .toLowerCase()
    .replace(/\s+/g, '_');
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `prod_${Math.abs(hash)}_${rowIndex}`;
}

/**
 * Normalizes raw rows + header mapping into validated InternalProduct objects.
 * Validates that Category, Product Name, and Price exist and are valid.
 * One malformed row will never break valid products.
 */
export function normalizeProductRows(
  headers: string[],
  dataRows: unknown[][]
): InternalProduct[] {
  const colMap = resolveHeaderColumns(headers);
  if (!colMap) {
    throw new Error(
      `Invalid Google Sheet structure: Missing required columns (Category, Product Name, Price). Found: ${headers.join(', ')}`
    );
  }

  const products: InternalProduct[] = [];
  let currentCategory = '';

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!Array.isArray(row)) continue;

    const rawCategory = row[colMap.categoryIdx];
    const rawName = row[colMap.nameIdx];
    const rawPrice = row[colMap.priceIdx];
    const rawProfit = colMap.profitIdx !== -1 ? row[colMap.profitIdx] : null;
    const rawDescription = colMap.descriptionIdx !== -1 ? row[colMap.descriptionIdx] : '';
    const rawImage = colMap.imageIdx !== -1 ? row[colMap.imageIdx] : '';

    const categoryCandidate =
      typeof rawCategory === 'string' ? rawCategory.trim() : String(rawCategory ?? '').trim();
    if (categoryCandidate) {
      currentCategory = categoryCandidate;
    }
    const category = currentCategory;
    const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();
    const price = parseMonetaryNumber(rawPrice);

    // Data validation rule (Requirement 21):
    // Category exists, Product Name exists, Price exists and >= 0
    if (!category || !name || price === null || price < 0) {
      continue;
    }

    let profit = parseMonetaryNumber(rawProfit);
    if (profit !== null && profit < 0) {
      profit = null;
    }

    const description =
      typeof rawDescription === 'string'
        ? rawDescription.trim()
        : String(rawDescription ?? '').trim();

    const image =
      typeof rawImage === 'string' ? rawImage.trim() : String(rawImage ?? '').trim();

    const id = buildProductId(category, name, i);

    // Apply test override if registered for automated testing
    const overrideById = profitTestOverrides.get(id.toLowerCase());
    const overrideByName = profitTestOverrides.get(name.toLowerCase());
    if (overrideById !== undefined) {
      profit = overrideById;
    } else if (overrideByName !== undefined) {
      profit = overrideByName;
    }

    products.push({
      id,
      category,
      name,
      price,
      profit,
      description,
      image,
    });
  }

  return products;
}

/**
 * Fetches live product data from Google Sheets (Sheet1) using both gviz JSON and CSV fallback,
 * mapping strictly by column headers.
 */
export async function fetchProductsFromGoogleSheet(options?: {
  forceRefresh?: boolean;
  sheetId?: string;
}): Promise<InternalProduct[]> {
  const targetSheetId = options?.sheetId || activeSheetId;
  const now = Date.now();

  if (
    !options?.forceRefresh &&
    cachedData &&
    cachedData.sheetId === targetSheetId &&
    now - cachedData.fetchedAt < CACHE_TTL_MS
  ) {
    // Re-apply any runtime profit overrides on cached items
    return cachedData.products.map((p) => {
      const overrideById = profitTestOverrides.get(p.id.toLowerCase());
      const overrideByName = profitTestOverrides.get(p.name.toLowerCase());
      if (overrideById !== undefined) return { ...p, profit: overrideById };
      if (overrideByName !== undefined) return { ...p, profit: overrideByName };
      return { ...p };
    });
  }

  try {
    let csvText = '';

    // Strategy 1: Direct Google Sheet CSV export (live data, bypasses gviz cache)
    const directExportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      targetSheetId
    )}/export?format=csv&_ts=${now}`;

    try {
      const directRes = await fetch(directExportUrl, {
        headers: {
          Accept: 'text/csv,text/plain,*/*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
      if (directRes.ok) {
        csvText = await directRes.text();
      }
    } catch {
      // Continue to Strategy 2 fallback
    }

    // Strategy 2: Google Visualization API CSV fallback
    if (!csvText || csvText.trim().length === 0) {
      const gvizCsvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
        targetSheetId
      )}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(WORKSHEET_NAME)}&_ts=${now}`;

      const gvizRes = await fetch(gvizCsvUrl, {
        headers: {
          Accept: 'text/csv,text/plain,*/*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });

      if (!gvizRes.ok) {
        throw new Error(`Google Sheet HTTP status ${gvizRes.status}`);
      }
      csvText = await gvizRes.text();
    }

    const parsedRows = parseCsvRows(csvText);

    if (parsedRows.length === 0) {
      throw new Error('Google Sheet returned empty content');
    }

    const headers = parsedRows[0];
    const dataRows = parsedRows.slice(1);
    const products = normalizeProductRows(headers, dataRows);

    cachedData = {
      products,
      fetchedAt: now,
      sheetId: targetSheetId,
    };

    return products;
  } catch (err) {
    // Fallback to previously cached valid data if available (Requirement 22)
    if (cachedData && cachedData.sheetId === targetSheetId) {
      console.warn('Using cached Google Sheet data due to fetch error:', err);
      return cachedData.products;
    }
    throw err;
  }
}

/**
 * Strips the private Profit field before sending product objects to any customer-facing API or view.
 * Requirement 3: Profit must NEVER be exposed in any customer-facing response or client data object.
 */
export function stripProfitForCustomer(product: InternalProduct): PublicProduct {
  return {
    id: product.id,
    category: product.category,
    name: product.name,
    price: product.price,
    description: product.description,
    image: product.image,
  };
}

export function stripProfitListForCustomer(products: InternalProduct[]): PublicProduct[] {
  return products.map(stripProfitForCustomer);
}
