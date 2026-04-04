const db = require("../db");

exports.getUsers = async () => {
  const [rows] = await db.query("SELECT * FROM users");
  return rows;
};

exports.createUser = async (user) => {
  const query = "INSERT INTO users (name,email,password) VALUES (?,?,?)";
  const [result] = await db.query(query, [user.name, user.email, user.password]);
  return result;
};

exports.getUserByEmail = async (email) => {
  const query = "SELECT * FROM users WHERE email = ?";
  const [rows] = await db.query(query, [email]);
  return rows[0];
};

exports.getUserById = async (userId) => {
  const query = "SELECT * FROM users WHERE id = ? LIMIT 1";
  const [rows] = await db.query(query, [userId]);
  return rows?.[0] || null;
};

exports.sendMessage = async (data) => {
  const query =
    "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
  const [result] = await db.query(query, [
    data.sender_id,
    data.receiver_id,
    data.message
  ]);
  return result;
};

exports.getMessages = async (senderId, receiverId) => {
  const query = `
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?)
    OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `;

  const [rows] = await db.query(query, [
    senderId,
    receiverId,
    receiverId,
    senderId
  ]);
  return rows;
};

exports.updateProfileImage = async (userId, imagePath) => {
  const query = "UPDATE users SET avatar = ? WHERE id = ?";
  const [result] = await db.query(query, [imagePath, userId]);
  return result;
};

exports.updateAbout = async (userId, about) => {
  const query = "UPDATE users SET about = ? WHERE id = ?";
  const [result] = await db.query(query, [about, userId]);
  return result;
};

exports.updateFcmToken = async (userId, fcmToken) => {
  const query = "UPDATE users SET fcm_token = ? WHERE id = ?";
  const [result] = await db.query(query, [fcmToken, userId]);
  return result;
};

exports.deleteAccount = async (userId, is_delete) => {
  const query = "UPDATE users SET is_deleted = ? WHERE id = ? ";
  const [result] = await db.query(query, [is_delete, userId]);
  return result;
};

exports.createStatusPost = async (data) => {
  const query = `
    INSERT INTO status_posts (user_id, media_url, text_content, expires_at)
    VALUES (?, ?, ?, ?)
  `;

  const [result] = await db.query(query, [
    data.user_id,
    data.media_url || null,
    data.text_content || null,
    data.expires_at || null
  ]);
  return result;
};

exports.getStatusPosts = async (userId = null) => {
  const baseQuery = `
    SELECT id, user_id, media_url, text_content, created_at, expires_at
    FROM status_posts
    WHERE expires_at IS NULL OR expires_at > NOW()
  `;

  if (userId === null || userId === undefined) {
    const query = `${baseQuery} ORDER BY created_at DESC`;
    const [rows] = await db.query(query);
    return rows;
  }

  const query = `${baseQuery} AND user_id = ? ORDER BY created_at DESC`;
  const [rows] = await db.query(query, [userId]);
  return rows;
};

exports.getStatusViews = async (statusId) => {
  const query = `
    SELECT
      sv.id,
      sv.status_id,
      sv.viewer_id,
      sv.viewed_at,
      u.name AS viewer_name,
      u.avatar AS viewer_avatar
    FROM status_views sv
    LEFT JOIN users u ON u.id = sv.viewer_id
    WHERE sv.status_id = ?
    ORDER BY sv.viewed_at DESC
  `;

  const [rows] = await db.query(query, [statusId]);
  return rows;
};

exports.markStatusView = async (statusId, viewerId) => {
  const query = `
    INSERT IGNORE INTO status_views (status_id, viewer_id)
    VALUES (?, ?)
  `;

  const [result] = await db.query(query, [statusId, viewerId]);
  return result;
};

exports.deleteStatus = async (statusId, userId) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const checkQuery =
      "SELECT id FROM status_posts WHERE id = ? AND user_id = ? LIMIT 1";
    const [checkRows] = await connection.query(checkQuery, [statusId, userId]);

    if (!checkRows || !checkRows.length) {
      await connection.rollback();
      return { affectedRows: 0 };
    }

    const deleteViewsQuery = "DELETE FROM status_views WHERE status_id = ?";
    await connection.query(deleteViewsQuery, [statusId]);

    const deleteStatusQuery =
      "DELETE FROM status_posts WHERE id = ? AND user_id = ?";
    const [deleteStatusResult] = await connection.query(deleteStatusQuery, [
      statusId,
      userId
    ]);

    await connection.commit();
    return deleteStatusResult;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.getAppUsageStats = async (userId, fromDate = null, toDate = null) => {
  const query = `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN event_type IN ('app_session_ended', 'app_time_spent')
              THEN COALESCE(
                CAST(
                  JSON_UNQUOTE(
                    COALESCE(
                      JSON_EXTRACT(metadata, '$.durationSeconds'),
                      JSON_EXTRACT(metadata, '$.duration_seconds')
                    )
                  ) AS DECIMAL(18,2)
                ),
                0
              )
            ELSE 0
          END
        ),
        0
      ) AS totalSeconds,
      COUNT(CASE WHEN event_type = 'app_session_started' THEN 1 END) AS sessionsStarted,
      COUNT(CASE WHEN event_type = 'app_session_ended' THEN 1 END) AS sessionsEnded
    FROM events
    WHERE user_id = ?
      AND (? IS NULL OR created_at >= ?)
      AND (? IS NULL OR created_at <= ?)
  `;

  const [rows] = await db.query(query, [userId, fromDate, fromDate, toDate, toDate]);
  return rows?.[0] || { totalSeconds: 0, sessionsStarted: 0, sessionsEnded: 0 };
};

exports.getPageUsageStats = async (userId, fromDate = null, toDate = null) => {
  const query = `
    SELECT
      JSON_UNQUOTE(
        COALESCE(
          JSON_EXTRACT(metadata, '$.page'),
          JSON_EXTRACT(metadata, '$.screen')
        )
      ) AS page,
      COALESCE(
        SUM(
          COALESCE(
            CAST(
              JSON_UNQUOTE(
                COALESCE(
                  JSON_EXTRACT(metadata, '$.durationSeconds'),
                  JSON_EXTRACT(metadata, '$.duration_seconds')
                )
              ) AS DECIMAL(18,2)
            ),
            0
          )
        ),
        0
      ) AS totalSeconds
    FROM events
    WHERE user_id = ?
      AND event_type = 'page_time_spent'
      AND (? IS NULL OR created_at >= ?)
      AND (? IS NULL OR created_at <= ?)
    GROUP BY page
    HAVING page IS NOT NULL AND page != ''
    ORDER BY totalSeconds DESC
  `;

  const [rows] = await db.query(query, [userId, fromDate, fromDate, toDate, toDate]);
  return rows || [];
};

exports.getAiToolInsights = async ({ userId = null, fromDate = null, toDate = null } = {}) => {
  const query = `
    SELECT
      tool,
      COUNT(*) AS usageCount,
      COALESCE(SUM(durationMs), 0) AS totalDurationMs,
      COALESCE(AVG(durationMs), 0) AS avgDurationMs
    FROM (
      SELECT
        JSON_UNQUOTE(
          COALESCE(
            JSON_EXTRACT(metadata, '$.tool'),
            JSON_EXTRACT(metadata, '$.name')
          )
        ) AS tool,
        COALESCE(
          CAST(
            JSON_UNQUOTE(
              COALESCE(
                JSON_EXTRACT(metadata, '$.durationMs'),
                JSON_EXTRACT(metadata, '$.duration_ms')
              )
            ) AS DECIMAL(18,2)
          ),
          0
        ) AS durationMs
      FROM events
      WHERE event_type = 'ai_tool_used'
        AND (? IS NULL OR user_id = ?)
        AND (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
    ) t
    WHERE tool IS NOT NULL AND tool != ''
    GROUP BY tool
    ORDER BY usageCount DESC, totalDurationMs DESC
  `;

  const [rows] = await db.query(query, [userId, userId, fromDate, fromDate, toDate, toDate]);
  return rows || [];
};

exports.createPayment = async (data) => {
  const query = `
    INSERT INTO payments (user_id, amount, status, transaction_id)
    VALUES (?, ?, ?, ?)
  `;

  const [result] = await db.query(query, [
    data.user_id,
    data.amount,
    data.status,
    data.transaction_id
  ]);
  return result;
};

exports.getPremiumStatus = async (userId) => {
  const query = `
    SELECT id
    FROM payments
    WHERE user_id = ? AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const [rows] = await db.query(query, [userId]);
  return rows && rows.length > 0;
};
