const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
  });

  try {
    console.log("--- Checking User and Agent Join ---");
    const query = `
      SELECT 
        u.id as user_id, 
        u.bubble_id as user_bubble, 
        u.linked_agent_profile, 
        a.name as agent_name 
      FROM "user" u 
      JOIN agent a ON u.linked_agent_profile = a.bubble_id 
      LIMIT 5;
    `;
    const res = await pool.query(query);
    console.log("Sample User-Agent Links:", JSON.stringify(res.rows, null, 2));

    console.log("\n--- Checking Invoice V2 created_by Link ---");
    const query2 = `
      SELECT 
        i.id as invoice_id, 
        i.created_by, 
        u.id as user_id, 
        a.name as agent_name
      FROM invoice_new i
      LEFT JOIN "user" u ON i.created_by = u.bubble_id OR CAST(u.id AS TEXT) = i.created_by
      LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
      WHERE i.created_by IS NOT NULL
      LIMIT 5;
    `;
    const res2 = await pool.query(query2);
    console.log("Invoice V2 Agent Links:", JSON.stringify(res2.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
