require("dotenv").config();
const db = require("../db");

const TARGET_COLUMNS = [
  "media_url",
  "mediaUrl",
  "avatar",
  "profileImage",
  "profile_image",
  "image_url",
  "imageUrl",
  "audio_url",
  "audioUrl"
];

function getHostFromPublicBaseUrl() {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (!configured) {
    return "ai-chat-app-s971.onrender.com";
  }

  try {
    const value = configured.startsWith("http")
      ? configured
      : `https://${configured}`;
    const url = new URL(value);
    return url.host;
  } catch (error) {
    return configured.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

async function run() {
  const schemaName = process.env.DB_NAME;
  if (!schemaName) {
    throw new Error("DB_NAME is required to run migration");
  }

  const host = getHostFromPublicBaseUrl();
  const oldPrefix = `http://${host}`;
  const newPrefix = `https://${host}`;

  const placeholders = TARGET_COLUMNS.map(() => "?").join(", ");
  const [columns] = await db.query(
    `
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND COLUMN_NAME IN (${placeholders})
    `,
    [schemaName, ...TARGET_COLUMNS]
  );

  if (!columns.length) {
    console.log("No media URL columns found for migration.");
    return;
  }

  let totalRowsChanged = 0;

  for (const entry of columns) {
    const tableName = entry.TABLE_NAME;
    const columnName = entry.COLUMN_NAME;
    const escapedTable = `\`${tableName.replace(/`/g, "``")}\``;
    const escapedColumn = `\`${columnName.replace(/`/g, "``")}\``;

    const [hostReplaceResult] = await db.query(
      `
        UPDATE ${escapedTable}
        SET ${escapedColumn} = REPLACE(${escapedColumn}, ?, ?)
        WHERE ${escapedColumn} LIKE ?
      `,
      [oldPrefix, newPrefix, `${oldPrefix}%`]
    );

    const [genericReplaceResult] = await db.query(
      `
        UPDATE ${escapedTable}
        SET ${escapedColumn} = REPLACE(${escapedColumn}, 'http://', 'https://')
        WHERE ${escapedColumn} LIKE 'http://%'
      `
    );

    const changedRows =
      Number(hostReplaceResult?.affectedRows || 0) +
      Number(genericReplaceResult?.affectedRows || 0);
    totalRowsChanged += changedRows;

    if (changedRows > 0) {
      console.log(
        `Updated ${changedRows} row(s) in ${tableName}.${columnName}`
      );
    }
  }

  console.log(`Migration complete. Total updated rows: ${totalRowsChanged}`);
}

run()
  .catch((error) => {
    console.error("Migration failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (error) {
      // ignore close errors
    }
  });
