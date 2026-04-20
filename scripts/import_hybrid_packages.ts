import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
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

type SkippedRow = {
  packageName: string;
  inverterModel: string;
  reason: string;
};

type ImportResult = {
  inserted: string[];
  updated: string[];
  skipped: SkippedRow[];
};

const PANEL_BUBBLE_IDS: Record<number, string> = {
  590: "1692255863479x555358685401972740",
  620: "1741540531671x608460181016150000",
  650: "1771039183637x205243619540992000",
};

const CONNECTION_STRING =
  "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const CSV_PATH = path.resolve(process.cwd(), "HYBIRD PACKAGE.csv");
const BLOCK_STARTS = [0, 12, 24];
const BLOCK_WIDTH = 8;
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

function parseLogicalRows(csvText: string): string[][] {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const logicalRows: string[][] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    let assembledLine = rawLine;
    while ((assembledLine.match(/"/g) ?? []).length % 2 !== 0 && i < lines.length - 1) {
      i += 1;
      assembledLine += `\n${lines[i]}`;
    }

    logicalRows.push(parseCsvLine(assembledLine));
  }

  return logicalRows;
}

function padRow(row: string[], width: number): string[] {
  return row.length >= width ? row : [...row, ...Array.from({ length: width - row.length }, () => "")];
}

function parseCsvRows(csvText: string): CsvRow[] {
  const logicalRows = parseLogicalRows(csvText);
  const rows: CsvRow[] = [];

  for (let i = 0; i < logicalRows.length; i += 1) {
    const sectionRow = logicalRows[i];
    const firstCell = sectionRow[0]?.trim() ?? "";
    if (!firstCell.startsWith("PACKAGE OF ")) continue;

    const headerRow = logicalRows[i + 1] ?? [];
    const nextSectionIndex = logicalRows.findIndex(
      (candidate, index) => index > i && (candidate[0]?.trim() ?? "").startsWith("PACKAGE OF ")
    );
    const endIndex = nextSectionIndex === -1 ? logicalRows.length : nextSectionIndex;

    const sectionRowPadded = padRow(sectionRow, 32);
    const headerRowPadded = padRow(headerRow, 32);

    for (const start of BLOCK_STARTS) {
      const section = sectionRowPadded[start]?.trim() ?? "";
      const headers = headerRowPadded.slice(start, start + BLOCK_WIDTH).map((header) => header.trim());
      if (!section || headers[0] !== "NO PANELS") continue;

      for (let rowIndex = i + 2; rowIndex < endIndex; rowIndex += 1) {
        const candidate = padRow(logicalRows[rowIndex], 32);
        const values = candidate.slice(start, start + BLOCK_WIDTH).map((value) => value.trim());
        if (!values[0] || values[0] === "NO PANELS") continue;

        const record = Object.fromEntries(
          headers.map((header, index) => [header, values[index] ?? ""])
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
          type: record["PACKAGE Type"] || record["Type"] || null,
          price: normalizePrice(record["Price"] || "0"),
        });
      }
    }
  }

  return rows;
}

function normalizePrice(raw: string): string {
  const numeric = raw.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(numeric || "0");
  return parsed.toFixed(2);
}

function extractWattage(value: string): number | null {
  const match = value.match(/\b(590|620|650)(?:\s*W)?\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found: ${CSV_PATH}`);
  }

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const csvRows = parseCsvRows(csvText).filter((row) => row.packageName && row.inverterModel);

  const pool = new Pool({
    connectionString: CONNECTION_STRING,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  const db = drizzle(pool, { schema: { packages, products } });

  try {
    const packageNames = csvRows.map((row) => row.packageName);
    const existingPackages = packageNames.length
      ? await db
          .select({
            id: packages.id,
            package_name: packages.package_name,
          })
          .from(packages)
          .where(inArray(packages.package_name, packageNames))
      : [];

    const panelProducts = await db
      .select({
        id: products.id,
        bubble_id: products.bubble_id,
        name: products.name,
        solar_output_rating: products.solar_output_rating,
      })
      .from(products)
      .where(inArray(products.solar_output_rating, [590, 620, 650]));

    const packageByName = new Map(
      existingPackages
        .filter((row) => row.package_name)
        .map((row) => [row.package_name as string, row])
    );
    const panelByWatt = new Map(
      panelProducts
        .filter((row) => row.solar_output_rating !== null && row.bubble_id)
        .map((row) => [Number(row.solar_output_rating), row.bubble_id as string])
    );

    const result: ImportResult = {
      inserted: [],
      updated: [],
      skipped: [],
    };

    for (const row of csvRows) {
      const wattage =
        extractWattage(row.panelType) ??
        extractWattage(row.packageName) ??
        extractWattage(row.invoiceDescription);
      const panelBubbleId =
        (wattage !== null ? panelByWatt.get(wattage) : null) ??
        (wattage !== null ? PANEL_BUBBLE_IDS[wattage] ?? null : null);

      if (!panelBubbleId) {
        result.skipped.push({
          packageName: row.packageName,
          inverterModel: row.inverterModel,
          reason: "missing_panel_product",
        });
        continue;
      }

      const values = {
        active: true,
        invoice_desc: row.invoiceDescription,
        package_name: row.packageName,
        panel: panelBubbleId,
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
