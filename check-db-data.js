const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
  });

  try {
    console.log("--- Checking INVOICE (v1) ---");
    const resV1 = await pool.query("SELECT * FROM invoice LIMIT 1;");
    console.log("v1 row sample:", JSON.stringify(resV1.rows[0], null, 2));

    console.log("\n--- Checking INVOICE_NEW (v2) ---");
    const resV2 = await pool.query("SELECT * FROM invoice_new LIMIT 1;");
    console.log("v2 row sample:", JSON.stringify(resV2.rows[0], null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
