const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to DB");
    
    const query = `
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await client.query(query);
    console.log("Table app_settings created or already exists.");
    
  } catch (error) {
    console.error("Error connecting or querying:", error);
  } finally {
    await client.end();
  }
}

main();
