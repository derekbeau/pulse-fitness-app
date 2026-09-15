import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('0066 body check-in migration lifecycle', () => {
  it('applies to populated legacy state without rewriting scalar facts and cascades only new rows', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE body_measurements (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        waist_mm INTEGER,
        notes TEXT
      );
      INSERT INTO users(id) VALUES ('legacy-user');
      INSERT INTO body_measurements(id,user_id,local_date,waist_mm,notes)
      VALUES ('legacy-measurement','legacy-user','2026-09-01',813,'historical scalar only');
    `);
    const sql = readFileSync(
      fileURLToPath(new URL('../../drizzle/0066_body_check_in_foundation.sql', import.meta.url)),
      'utf8',
    );
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((value) => value.trim())
      .filter(Boolean))
      sqlite.exec(statement);
    expect(sqlite.prepare('SELECT * FROM body_measurements').get()).toMatchObject({
      id: 'legacy-measurement',
      waist_mm: 813,
      notes: 'historical scalar only',
    });
    sqlite.exec(`
      INSERT INTO body_check_in_preferences(user_id,length_unit,enabled_sites,anchor_date,protocol_version)
      VALUES ('legacy-user','cm','[]','2026-09-15','body-circumference-v1');
      INSERT INTO body_check_ins(id,user_id,local_date,status,protocol_version,source,completed_at)
      VALUES ('new-check-in','legacy-user','2026-09-15','completed','body-circumference-v1','user',1);
      INSERT INTO body_check_in_measurements(
        id,check_in_id,site,laterality,unit_at_entry,reading_1_mm,canonical_mm,quality,
        protocol_id,protocol_version,protocol_name,protocol_instructions,protocol_source_urls
      ) VALUES (
        'new-reading','new-check-in','waist_iliac_crest_nhanes','none','cm',800,800,
        'single_reading','waist_iliac_crest_nhanes','body-circumference-v1',
        'NHANES iliac-crest waist','historical snapshot','["https://example.com/source"]'
      );
      DELETE FROM body_check_ins WHERE id = 'new-check-in';
    `);
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM body_check_in_measurements').get(),
    ).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) AS count FROM body_measurements').get()).toEqual({
      count: 1,
    });
    sqlite.close();
  });
});
