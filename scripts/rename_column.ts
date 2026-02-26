import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
});

async function main() {
    try {
        const client = await pool.connect();
        await client.query(`ALTER TABLE seda_registration RENAME COLUMN reg_status TO mapper_status;`);
        console.log("Renamed column reg_status to mapper_status successfully.");
        client.release();
    } catch (err: any) {
        if (err.code === '42703') {
            console.log("Column may already be renamed:", err.message);
        } else {
            console.error(err);
        }
    } finally {
        await pool.end();
    }
}

main();
