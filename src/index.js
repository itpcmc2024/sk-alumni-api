import postgres from "postgres";

const ALLOWED_ORIGINS = [
  "https://itpcmc2024.github.io"
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";

  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow"
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request)
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    const sql = postgres(env.HYPERDRIVE.connectionString, {
      max: 5,
      fetch_types: false,
      prepare: true
    });

    try {

      // =====================================================
      // HOME
      // =====================================================
      if (path === "/") {
        return json(request, {
          success: true,
          app: "SK Alumni API",
          version: "1.0.0",
          status: "online",
          endpoints: [
            "/api/health",
            "/api/settings/public",
            "/api/members/:memberCode"
          ]
        });
      }

      // =====================================================
      // HEALTH CHECK
      // =====================================================
      if (path === "/api/health" && request.method === "GET") {
        const result = await sql`
          SELECT
            current_database() AS database,
            NOW() AS server_time
        `;

        return json(request, {
          success: true,
          service: "sk-alumni-api",
          database: result[0].database,
          server_time: result[0].server_time
        });
      }

      // =====================================================
      // PUBLIC SETTINGS
      // =====================================================
      if (path === "/api/settings/public" && request.method === "GET") {

        const rows = await sql`
          SELECT
            setting_key,
            setting_value
          FROM app_settings
          WHERE setting_key IN (
            'APP_NAME',
            'APP_VERSION',
            'MEMBERSHIP_FEE_YEARLY',
            'MEMBERSHIP_FEE_MONTHLY',
            'PROMPTPAY',
            'CONTACT_EMAIL'
          )
          ORDER BY setting_key
        `;

        const settings = {};

        for (const row of rows) {
          settings[row.setting_key] = row.setting_value;
        }

        return json(request, {
          success: true,
          data: settings
        });
      }

// =====================================================
// MEMBER LOOKUP
// GET /api/members/:memberCode
// =====================================================
if (
  path.startsWith("/api/members/") &&
  request.method === "GET"
) {
  const memberCode = decodeURIComponent(
    path.replace("/api/members/", "")
  ).trim();

  if (!memberCode) {
    return json(request, {
      success: false,
      message: "กรุณาระบุรหัสสมาชิก"
    }, 400);
  }

  const rows = await sql`
    SELECT
      m.member_code,
      m.prefix,
      m.full_name,
      m.arabic_name,
      m.status,
      m.member_start,
      m.member_expire,
      m.registered_at,

      a.subdistrict,
      a.district,
      a.province,
      a.postal_code

    FROM members m

    LEFT JOIN addresses a
      ON a.member_code = m.member_code

    WHERE m.member_code = ${memberCode}

    LIMIT 1
  `;

  if (!rows.length) {
    return json(request, {
      success: false,
      found: false,
      message: "ไม่พบข้อมูลสมาชิก"
    }, 404);
  }

  const member = rows[0];

  return json(request, {
    success: true,
    found: true,
    data: {
      member_code: member.member_code,
      prefix: member.prefix,
      full_name: member.full_name,
      arabic_name: member.arabic_name,
      status: member.status,
      member_start: member.member_start,
      member_expire: member.member_expire,
      registered_at: member.registered_at,

      address: {
        subdistrict: member.subdistrict,
        district: member.district,
        province: member.province,
        postal_code: member.postal_code
      }
    }
  });
}
      
      // =====================================================
      // NOT FOUND
      // =====================================================
      return json(request, {
        success: false,
        message: "API endpoint not found"
      }, 404);

    } catch (error) {

      console.error("SK Alumni API Error:", error);

      return json(request, {
        success: false,
        message: "Internal server error"
      }, 500);

    } finally {

      await sql.end().catch(() => {});

    }
  }
};
