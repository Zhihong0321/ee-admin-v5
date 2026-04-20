import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, ilike, inArray, or } from "drizzle-orm";
import { Pool } from "pg";

import { packages, products } from "../src/db/schema";

type CsvRow = {
  section: string;
  panelQty: number;
  inverterSize: string | null;
  inverterModel: string;
  panelType: string;
  packageName: string;
  invoiceDescription: string;
  type: string | null;
  price: string;
};

type ImportResult = {
  inserted: string[];
  updated: string[];
  skipped: string[];
  missingInverters: Array<{
    packageName: string;
    inverterModel: string;
  }>;
};

type ProductRow = {
  id: number;
  bubble_id: string | null;
  name: string | null;
  solar_output_rating?: number | null;
};

const CONNECTION_STRING =
  "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const CSV_PATH = path.resolve(process.cwd(), "PACKAGE-FULL-650W.csv");

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvRows(csvText: string): CsvRow[] {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows: CsvRow[] = [];
  let section = "";
  let headers: string[] | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const firstCell = parseCsvLine(rawLine)[0]?.trim() ?? "";
    if (!firstCell) continue;

    if (firstCell.startsWith("PACKAGE OF ")) {
      section = firstCell;
      headers = null;
      continue;
    }

    if (firstCell === "NO PANELS") {
      headers = parseCsvLine(rawLine);
      continue;
    }

    if (!headers) continue;

    // Rows with a quoted invoice description can span multiple lines. Keep reading
    // until the quote count is balanced so the CSV row is parsed correctly.
    let assembledLine = rawLine;
    while ((assembledLine.match(/"/g) ?? []).length % 2 !== 0 && i < lines.length - 1) {
      i += 1;
      assembledLine += `\n${lines[i]}`;
    }

    const values = parseCsvLine(assembledLine);
    if (!values.some((value) => value.trim())) continue;

    const record = Object.fromEntries(
      headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])
    );

    const panelQty = Number.parseInt(record["NO PANELS"], 10);
    if (Number.isNaN(panelQty)) continue;

    rows.push({
      section,
      panelQty,
      inverterSize: record["INVERTER SIZE"] || null,
      inverterModel: record["INVERTER MODEL"] || "",
      panelType: record["PANELS TYPE"] || "",
      packageName: record["Package Name"] || "",
      invoiceDescription: record["Invoice Description"] || "",
      type: record["Type"] || null,
      price: normalizePrice(record["Price"] || "0"),
    });
  }

  return rows;
}

function normalizePrice(raw: string): string {
  const numeric = raw.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(numeric || "0");
  return parsed.toFixed(2);
}

function normalizeName(value: string): string {
  return value
    .replace(/^1X\s+/i, "")
    .replace(/KW/gi, "K")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function resolveProductMatch(
  rawName: string,
  exactMap: Map<string, ProductRow>,
  normalizedMap: Map<string, ProductRow>,
  allProducts: ProductRow[]
): ProductRow | undefined {
  const exact = exactMap.get(rawName);
  if (exact) return exact;

  const normalizedName = normalizeName(rawName);
  const normalized = normalizedMap.get(normalizedName);
  if (normalized) return normalized;

  return allProducts.find((product) => {
    const candidate = normalizeName(product.name ?? "");
    return normalizedName.includes(candidate) || candidate.includes(normalizedName);
  });
}

function extractWattage(value: string): number | null {
  const match = value.match(/(\d{3,4})\s*W/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found: ${CSV_PATH}`);
  }

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const csvRows = parseCsvRows(csvText);

  const pool = new Pool({
    connectionString: CONNECTION_STRING,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  const db = drizzle(pool, { schema: { packages, products } });

  try {
    const packageNames = csvRows.map((row) => row.packageName);
    const inverterNames = Array.from(
      new Set(csvRows.map((row) => row.inverterModel).filter(Boolean))
    );
    const panelNames = Array.from(new Set(csvRows.map((row) => row.panelType).filter(Boolean)));

    const existingPackages = packageNames.length
      ? await db
          .select({
            id: packages.id,
            package_name: packages.package_name,
          })
          .from(packages)
          .where(inArray(packages.package_name, packageNames))
      : [];

    const matchedProducts = await db
      .select({
        id: products.id,
        bubble_id: products.bubble_id,
        name: products.name,
        solar_output_rating: products.solar_output_rating,
      })
      .from(products)
      .where(
        or(
          ilike(products.name, "%SAJ R5%"),
          ilike(products.name, "%SAJ R6%"),
          ilike(products.name, "%650W%JinkoSolar%")
        )
      );

    const packageByName = new Map(
      existingPackages
        .filter((row) => row.package_name)
        .map((row) => [row.package_name as string, row])
    );
    const allProducts: ProductRow[] = matchedProducts.map((row) => ({
      id: row.id,
      bubble_id: row.bubble_id,
      name: row.name,
      solar_output_rating: row.solar_output_rating,
    }));
    const productByName = new Map(
      matchedProducts
        .filter((row) => row.name)
        .map((row) => [row.name as string, row])
    );
    const productByNormalizedName = new Map(
      matchedProducts
        .filter((row) => row.name)
        .map((row) => [normalizeName(row.name as string), row])
    );

    const result: ImportResult = {
      inserted: [],
      updated: [],
      skipped: [],
      missingInverters: [],
    };

    for (const row of csvRows) {
      let panelProduct = resolveProductMatch(
        row.panelType,
        productByName,
        productByNormalizedName,
        allProducts
      );
      if (!panelProduct) {
        const wattage = extractWattage(row.panelType);
        if (wattage !== null) {
          panelProduct = allProducts.find(
            (product) => product.solar_output_rating === wattage
          );
        }
      }
      const inverterProduct = resolveProductMatch(
        row.inverterModel,
        productByName,
        productByNormalizedName,
        allProducts
      );

      if (!inverterProduct) {
        result.missingInverters.push({
          packageName: row.packageName,
          inverterModel: row.inverterModel,
        });
      }

      const values = {
        active: true,
        invoice_desc: row.invoiceDescription,
        package_name: row.packageName,
        panel: panelProduct?.bubble_id ?? null,
        panel_qty: row.panelQty,
        price: row.price,
        type: row.type,
        updated_at: new Date(),
      };

      const existing = packageByName.get(row.packageName);
      if (existing) {
        await db.update(packages).set(values).where(eq(packages.id, existing.id));
        result.updated.push(row.packageName);
        continue;
      }

      await db.insert(packages).values({
        ...values,
        bubble_id: null,
        created_at: new Date(),
        created_by: null,
        created_date: new Date(),
        last_synced_at: new Date(),
        linked_package_item: null,
        max_discount: null,
        modified_date: new Date(),
        need_approval: false,
        password: null,
        special: false,
      });
      result.inserted.push(row.packageName);
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
