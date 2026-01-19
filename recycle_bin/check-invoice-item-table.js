const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
});

async function checkTables() {
  const client = await pool.connect();
  
  try {
    // Check for invoice_item table
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%invoice%item%'
      ORDER BY table_name
    `);
    
    console.log('=== Invoice Item Tables ===');
    result.rows.forEach(row => {
      console.log(`- ${row.table_name}`);
    });
    
    // Get columns from invoice_item table if it exists
    if (result.rows.length > 0) {
      const tableName = result.rows[0].table_name;
      const columns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      console.log(`\n=== Columns in ${tableName} ===`);
      columns.rows.forEach(col => {
        console.log(`- ${col.column_name}: ${col.data_type}`);
      });
      
      // Count records
      const count = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
      console.log(`\nTotal records: ${count.rows[0].count}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();
