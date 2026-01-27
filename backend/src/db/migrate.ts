import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Database Migration Script
 * Runs SQL migrations to set up the database schema
 */
async function migrate() {
  // Get database connection from environment
  const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  // Validate required environment variables
  if (!dbConfig.host || !dbConfig.database || !dbConfig.user) {
    console.error('❌ Missing required database environment variables:');
    console.error('   Required: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD');
    console.error('   Current values:');
    console.error(`   DB_HOST: ${dbConfig.host || 'NOT SET'}`);
    console.error(`   DB_NAME: ${dbConfig.database || 'NOT SET'}`);
    console.error(`   DB_USER: ${dbConfig.user || 'NOT SET'}`);
    process.exit(1);
  }

  const pool = new Pool(dbConfig);

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Get migration file path
    const migrationFile = path.join(__dirname, '../../migrations/001_initial_schema.sql');
    
    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration file not found: ${migrationFile}`);
    }

    // Read and execute migration
    console.log(`📄 Reading migration file: ${migrationFile}`);
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    console.log('🚀 Running migration...');
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully');
    
    // Verify tables were created
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Created tables:');
    result.rows.forEach((row: any) => {
      console.log(`   - ${row.table_name}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    await pool.end();
    process.exit(1);
  }
}

// Run migration
migrate().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
