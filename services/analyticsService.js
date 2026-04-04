const pool = require("../db");

exports.getAppUsageStats = async (userId = null, fromDate = null, toDate = null) => {
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
    WHERE (? IS NULL OR user_id = ?)
      AND (? IS NULL OR created_at >= ?)
      AND (? IS NULL OR created_at <= ?)
  `;

  const [rows] = await pool.query(query, [userId, userId, fromDate, fromDate, toDate, toDate]);
  return rows?.[0] || { totalSeconds: 0, sessionsStarted: 0, sessionsEnded: 0 };
};

exports.getPageUsageStats = async (userId = null, fromDate = null, toDate = null) => {
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
    WHERE (? IS NULL OR user_id = ?)
      AND event_type = 'page_time_spent'
      AND (? IS NULL OR created_at >= ?)
      AND (? IS NULL OR created_at <= ?)
    GROUP BY page
    HAVING page IS NOT NULL AND page != ''
    ORDER BY totalSeconds DESC
  `;

  const [rows] = await pool.query(query, [userId, userId, fromDate, fromDate, toDate, toDate]);
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

  const [rows] = await pool.query(query, [userId, userId, fromDate, fromDate, toDate, toDate]);
  return rows || [];
};

exports.getSessionsPerDay = async (userId = null, days = 30) => {
  const query = `
    SELECT DATE(created_at) AS day, COUNT(*) AS sessions
    FROM events
    WHERE (? IS NULL OR user_id = ?)
      AND event_type = 'app_session_started'
      AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `;
  const [rows] = await pool.query(query, [userId, userId, days]);
  return rows || [];
};

exports.getEventActivityPerDay = async (userId = null, days = 30) => {
  const query = `
    SELECT DATE(created_at) AS day, COUNT(*) AS activity
    FROM events
    WHERE (? IS NULL OR user_id = ?)
      AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `;
  const [rows] = await pool.query(query, [userId, userId, days]);
  return rows || [];
};
