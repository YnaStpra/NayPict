import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Fetching videos and photos...');

  const videos = await sql`
    SELECT p.photo_id, p.name, p.taken_time, p.create_time, e.exif, e.latitude, e.longitude, e.altitude
    FROM photo p
    LEFT JOIN exif e ON p.photo_id = e.photo_id
    WHERE p.type LIKE 'video/%'
    ORDER BY p.taken_time ASC, p.create_time ASC
  `;

  console.log(`Found ${videos.length} videos to process.`);

  let updatedCount = 0;
  let insertedCount = 0;
  const breakdown = {};

  for (const v of videos) {
    let make, model, lensModel;

    const name = v.name || '';
    const taken = v.taken_time || '';

    if (/^MVI_/i.test(name)) {
      make = 'Canon';
      model = 'Canon EOS M3';
      lensModel = 'EF-M15-45mm f/3.5-6.3 IS STM';
    } else if (/^IMG_/i.test(name) || /\.mov$/i.test(name)) {
      if (taken.includes('2025-10') || name.includes('202510')) {
        make = 'Apple';
        model = 'iPhone 13';
        lensModel = 'iPhone 13 dual wide camera';
      } else {
        make = 'Apple';
        model = 'iPhone 12';
        lensModel = 'iPhone 12 dual wide camera';
      }
    } else if (taken.includes('2024-07-11') || name.startsWith('20240711')) {
      make = 'Samsung';
      model = 'SM-A605G';
      lensModel = 'Samsung Galaxy A6+ Rear Camera';
    } else if (taken.includes('2025-02-23') || name.startsWith('20250223')) {
      make = 'Samsung';
      model = 'Galaxy S23';
      lensModel = 'Samsung Galaxy S23 Rear Wide Camera';
    } else {
      make = 'Samsung';
      model = 'SM-S901E';
      lensModel = 'Samsung Galaxy S22 Rear Wide Camera';
    }

    const deviceKey = `${make} ${model}`;
    breakdown[deviceKey] = (breakdown[deviceKey] || 0) + 1;

    let currentMeta = {};
    if (v.exif) {
      try {
        currentMeta = JSON.parse(v.exif);
      } catch (e) {
        console.warn(`Could not parse JSON exif for ${v.photo_id}:`, v.exif);
      }
    }

    const newMeta = {
      ...currentMeta,
      Make: make,
      Model: model,
      LensModel: lensModel,
    };

    const newExifStr = JSON.stringify(newMeta);

    // Update or Insert into exif table
    if (v.exif !== null && v.exif !== undefined) {
      await sql`
        UPDATE exif
        SET exif = ${newExifStr}
        WHERE photo_id = ${v.photo_id}
      `;
      updatedCount++;
    } else {
      await sql`
        INSERT INTO exif (photo_id, exif, latitude, longitude, altitude)
        VALUES (${v.photo_id}, ${newExifStr}, ${v.latitude ?? null}, ${v.longitude ?? null}, ${v.altitude ?? null})
        ON CONFLICT (photo_id) DO UPDATE SET exif = ${newExifStr}
      `;
      insertedCount++;
    }
  }

  console.log(`\nSuccessfully backfilled video EXIF metadata:`);
  console.log(`- Updated: ${updatedCount}`);
  console.log(`- Inserted: ${insertedCount}`);
  console.log(`- Total: ${updatedCount + insertedCount}`);
  console.log('\nBreakdown of camera devices assigned:');
  console.log(breakdown);
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
