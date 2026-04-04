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

exports.getChatSummary = async ({ fromDate = null, toDate = null } = {}) => {
  const [totalRows] = await pool.query(
    `
      SELECT COUNT(*) AS totalMessages
      FROM messages
      WHERE (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  const [messagesPerDayRows] = await pool.query(
    `
      SELECT DATE(created_at) AS day, COUNT(*) AS messages
      FROM messages
      WHERE (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  const [activeChatsRows] = await pool.query(
    `
      SELECT COUNT(*) AS activeChats
      FROM (
        SELECT
          LEAST(sender_id, receiver_id) AS userA,
          GREATEST(sender_id, receiver_id) AS userB
        FROM messages
        WHERE (? IS NULL OR created_at >= ?)
          AND (? IS NULL OR created_at <= ?)
        GROUP BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
      ) AS pairs
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  return {
    totalMessages: Number(totalRows?.[0]?.totalMessages || 0),
    messagesPerDay: messagesPerDayRows || [],
    activeChats: Number(activeChatsRows?.[0]?.activeChats || 0)
  };
};

exports.getFeatureSummary = async ({ fromDate = null, toDate = null } = {}) => {
  const [notificationRows] = await pool.query(
    `
      SELECT
        COUNT(CASE WHEN event_type = 'notification_sent' THEN 1 END) AS notificationsReceived,
        COUNT(CASE WHEN event_type = 'notification_opened' THEN 1 END) AS notificationsOpened
      FROM events
      WHERE (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  const [themeRows] = await pool.query(
    `
      SELECT
        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.theme')) AS theme,
        COUNT(*) AS usageCount
      FROM events
      WHERE event_type = 'theme_changed'
        AND (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
      GROUP BY theme
      HAVING theme IS NOT NULL AND theme != ''
      ORDER BY usageCount DESC
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  const [actionRows] = await pool.query(
    `
      SELECT event_type AS action, COUNT(*) AS actionCount
      FROM events
      WHERE event_type IN ('profile_image_updated', 'about_updated', 'theme_changed')
        AND (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
      GROUP BY event_type
      ORDER BY actionCount DESC
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  return {
    notificationsReceived: Number(notificationRows?.[0]?.notificationsReceived || 0),
    notificationsOpened: Number(notificationRows?.[0]?.notificationsOpened || 0),
    themeUsage: themeRows || [],
    settingsProfileActions: actionRows || []
  };
};

exports.getOverviewTotals = async () => {
  const [userRows] = await pool.query("SELECT COUNT(*) AS totalUsers FROM users");
  const [messageRows] = await pool.query("SELECT COUNT(*) AS totalMessages FROM messages");
  const [aiRows] = await pool.query(
    "SELECT COUNT(*) AS totalAiToolUses FROM events WHERE event_type = 'ai_tool_used'"
  );

  return {
    totalUsers: Number(userRows?.[0]?.totalUsers || 0),
    totalMessages: Number(messageRows?.[0]?.totalMessages || 0),
    totalAiToolUses: Number(aiRows?.[0]?.totalAiToolUses || 0)
  };
};

exports.getOverviewPeriodKpis = async ({ fromDate, toDate, previousFromDate, previousToDate }) => {
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(CASE WHEN e.event_type = 'user_registered' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) AS currentNewUsers,
        COUNT(CASE WHEN e.event_type = 'message_sent' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) +
        COUNT(CASE WHEN e.event_type = 'message_sent_ai' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) AS currentMessages,
        COUNT(CASE WHEN e.event_type = 'ai_tool_used' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) AS currentAiUsage,
        COUNT(CASE WHEN e.event_type = 'user_registered' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) AS previousNewUsers,
        COUNT(CASE WHEN e.event_type = 'message_sent' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) +
        COUNT(CASE WHEN e.event_type = 'message_sent_ai' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) AS previousMessages,
        COUNT(CASE WHEN e.event_type = 'ai_tool_used' AND e.created_at >= ? AND e.created_at <= ? THEN 1 END) AS previousAiUsage
      FROM events e
      WHERE e.created_at >= LEAST(?, ?)
        AND e.created_at <= GREATEST(?, ?)
    `,
    [
      fromDate, toDate,
      fromDate, toDate,
      fromDate, toDate,
      fromDate, toDate,
      previousFromDate, previousToDate,
      previousFromDate, previousToDate,
      previousFromDate, previousToDate,
      previousFromDate, previousToDate,
      previousFromDate, fromDate,
      toDate, previousToDate
    ]
  );

  return rows?.[0] || {};
};

exports.getUserPresenceSummary = async ({
  fromDate = null,
  toDate = null,
  onlineWindowMinutes = 15
} = {}) => {
  const [totalUsersRows] = await pool.query(
    "SELECT COUNT(*) AS totalRegisteredUsers FROM users"
  );

  const [onlineRows] = await pool.query(
    `
      SELECT COUNT(*) AS onlineUsers
      FROM (
        SELECT t.user_id
        FROM (
          SELECT e.user_id, MAX(e.created_at) AS lastEventAt
          FROM events e
          WHERE e.user_id IS NOT NULL
            AND e.event_type IN ('app_session_started', 'app_session_ended')
          GROUP BY e.user_id
        ) t
        INNER JOIN events e2
          ON e2.user_id = t.user_id
          AND e2.created_at = t.lastEventAt
          AND e2.event_type = 'app_session_started'
        WHERE e2.created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ) online_set
    `,
    [onlineWindowMinutes]
  );

  const [activeRows] = await pool.query(
    `
      SELECT COUNT(DISTINCT user_id) AS activeLast24h
      FROM events
      WHERE user_id IS NOT NULL
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `
  );

  const [trendRows] = await pool.query(
    `
      SELECT
        DATE(created_at) AS day,
        COUNT(DISTINCT user_id) AS onlinePeak
      FROM events
      WHERE event_type = 'app_session_started'
        AND user_id IS NOT NULL
        AND (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
    [fromDate, fromDate, toDate, toDate]
  );

  const totalRegisteredUsers = Number(totalUsersRows?.[0]?.totalRegisteredUsers || 0);
  const onlineUsers = Number(onlineRows?.[0]?.onlineUsers || 0);
  const activeLast24h = Number(activeRows?.[0]?.activeLast24h || 0);

  return {
    totalRegisteredUsers,
    onlineUsers,
    offlineUsers: Math.max(0, totalRegisteredUsers - onlineUsers),
    activeLast24h,
    onlineTrendPerDay: trendRows || []
  };
};
