import { Client } from "pg";

const ALLOWED_ORIGINS = [
  "https://itpcmc2024.github.io"
];

// =====================================================
// COMMON HELPERS
// =====================================================

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

function clean(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text === "" ? null : text;
}

function currentThaiYear2Digits() {
  const yearText = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric"
  }).format(new Date());

  const buddhistYear = Number(yearText) + 543;

  return String(buddhistYear).slice(-2);
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";

  if (!auth.startsWith("Bearer ")) {
    return "";
  }

  return auth.substring(7).trim();
}

function isAdmin(request, env) {
  const token = getBearerToken(request);

  if (!env.ADMIN_API_KEY) {
    return false;
  }

  return token === String(env.ADMIN_API_KEY);
}

function adminDenied(request, env) {
  if (!env.ADMIN_API_KEY) {
    return json(request, {
      success: false,
      message: "ADMIN_API_KEY ยังไม่ได้ตั้งค่า"
    }, 500);
  }

  return json(request, {
    success: false,
    message: "ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนผู้ดูแล"
  }, 401);
}

// =====================================================
// WORKER
// =====================================================

export default {
  async fetch(request, env) {

    // =================================================
    // CORS PREFLIGHT
    // =================================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // =================================================
    // HOME
    // =================================================
    if (path === "/") {
      return json(request, {
        success: true,
        app: "SK Alumni API",
        version: "1.2.0",
        status: "online",
        endpoints: {
          public: [
            "GET /api/health",
            "GET /api/settings/public",
            "GET /api/members",
            "GET /api/members/:memberCode",
            "POST /api/members/register"
          ],
          admin: [
            "GET /api/admin/check",
            "GET /api/admin/members",
            "GET /api/admin/members/:memberCode",
            "PATCH /api/admin/members/:memberCode",
            "POST /api/admin/members/:memberCode/approve",
            "POST /api/admin/members/:memberCode/cancel"
          ]
        }
      });
    }

    // =================================================
    // ADMIN CHECK
    // ไม่ต้องต่อฐานข้อมูล
    // =================================================
    if (
      path === "/api/admin/check" &&
      request.method === "GET"
    ) {
      if (!isAdmin(request, env)) {
        return adminDenied(request, env);
      }

      return json(request, {
        success: true,
        admin: true,
        message: "Admin API Key ถูกต้อง"
      });
    }

    // =================================================
    // HYPERDRIVE CHECK
    // =================================================
    if (!env.HYPERDRIVE?.connectionString) {
      return json(request, {
        success: false,
        message: "Hyperdrive binding not found"
      }, 500);
    }

    const client = new Client({
      connectionString: env.HYPERDRIVE.connectionString
    });

    let inTransaction = false;

    try {

      await client.connect();

      // =====================================================
      // HEALTH
      // GET /api/health
      // =====================================================
      if (
        path === "/api/health" &&
        request.method === "GET"
      ) {

        const result = await client.query(`
          SELECT
            current_database() AS database,
            NOW() AS server_time
        `);

        return json(request, {
          success: true,
          service: "sk-alumni-api",
          version: "1.2.0",
          database: result.rows[0]?.database || null,
          server_time: result.rows[0]?.server_time || null
        });
      }

      // =====================================================
      // PUBLIC SETTINGS
      // GET /api/settings/public
      // =====================================================
      if (
        path === "/api/settings/public" &&
        request.method === "GET"
      ) {

        const result = await client.query(`
          SELECT
            setting_key,
            setting_value
          FROM public.app_settings
          WHERE setting_key IN (
            'APP_NAME',
            'APP_VERSION',
            'MEMBERSHIP_FEE_YEARLY',
            'MEMBERSHIP_FEE_MONTHLY',
            'PROMPTPAY',
            'CONTACT_EMAIL'
          )
          ORDER BY setting_key
        `);

        const settings = {};

        for (const row of result.rows) {
          settings[row.setting_key] = row.setting_value;
        }

        return json(request, {
          success: true,
          data: settings
        });
      }

      // =====================================================
      // PUBLIC MEMBER LIST
      // GET /api/members
      //
      // ไม่ส่ง email / phone
      // =====================================================
      if (
        path === "/api/members" &&
        request.method === "GET"
      ) {

        const result = await client.query(`
          SELECT
            member_code,
            prefix,
            full_name,
            status,
            member_start,
            member_expire,
            registered_at
          FROM public.members
          ORDER BY registered_at DESC
          LIMIT 100
        `);

        return json(request, {
          success: true,
          data: result.rows
        });
      }

      // =====================================================
      // REGISTER MEMBER
      // POST /api/members/register
      // =====================================================
      if (
        path === "/api/members/register" &&
        request.method === "POST"
      ) {

        let body;

        try {
          body = await request.json();
        } catch {
          return json(request, {
            success: false,
            message: "รูปแบบข้อมูลไม่ถูกต้อง"
          }, 400);
        }

        const prefix = clean(body.prefix);
        const firstName = clean(body.first_name);
        const lastName = clean(body.last_name);
        const arabicName = clean(body.arabic_name);

        const phone = clean(body.phone);
        const email = clean(body.email);
        const lineId = clean(body.line_id);

        const addressLine = clean(body.address_line);
        const subdistrict = clean(body.subdistrict);
        const district = clean(body.district);
        const province = clean(body.province);
        const postalCode = clean(body.postal_code);

        const consent = body.consent === true;

        // ===============================================
        // VALIDATION
        // ===============================================
        if (!firstName) {
          return json(request, {
            success: false,
            message: "กรุณาระบุชื่อ"
          }, 400);
        }

        if (!lastName) {
          return json(request, {
            success: false,
            message: "กรุณาระบุนามสกุล"
          }, 400);
        }

        if (!phone) {
          return json(request, {
            success: false,
            message: "กรุณาระบุเบอร์โทรศัพท์"
          }, 400);
        }

        if (!consent) {
          return json(request, {
            success: false,
            message: "กรุณายอมรับเงื่อนไขและนโยบายข้อมูลส่วนบุคคล"
          }, 400);
        }

        if (
          email &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          return json(request, {
            success: false,
            message: "รูปแบบอีเมลไม่ถูกต้อง"
          }, 400);
        }

        // ===============================================
        // CHECK DUPLICATE
        // ===============================================
        const duplicate = await client.query(
          `
          SELECT
            member_code,
            phone,
            email
          FROM public.members
          WHERE phone = $1
             OR (
               $2::text IS NOT NULL
               AND LOWER(email) = LOWER($2)
             )
          LIMIT 1
          `,
          [phone, email]
        );

        if (duplicate.rows.length > 0) {
          return json(request, {
            success: false,
            duplicate: true,
            message: "พบข้อมูลสมาชิกที่ใช้เบอร์โทรศัพท์หรืออีเมลนี้แล้ว",
            member_code: duplicate.rows[0].member_code
          }, 409);
        }

        // ===============================================
        // GENERATE MEMBER CODE
        // เช่น 69-SK0003
        // ===============================================
        const yy = currentThaiYear2Digits();
        const codePrefix = `${yy}-SK`;

        await client.query("BEGIN");
        inTransaction = true;

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [codePrefix]
        );

        const nextResult = await client.query(
          `
          SELECT
            COALESCE(
              MAX(
                CAST(
                  SUBSTRING(
                    member_code
                    FROM '([0-9]+)$'
                  ) AS INTEGER
                )
              ),
              0
            ) + 1 AS next_no
          FROM public.members
          WHERE member_code LIKE $1
          `,
          [`${codePrefix}%`]
        );

        const nextNo = Number(
          nextResult.rows[0]?.next_no || 1
        );

        const memberCode =
          `${codePrefix}${String(nextNo).padStart(4, "0")}`;

        const fullName = [
          prefix,
          firstName,
          lastName
        ]
          .filter(Boolean)
          .join(" ");

        // ===============================================
        // INSERT MEMBER
        // ===============================================
        const memberResult = await client.query(
          `
          INSERT INTO public.members (
            member_code,
            prefix,
            first_name,
            last_name,
            full_name,
            arabic_name,
            phone,
            email,
            line_id,
            status,
            consent,
            registered_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            'pending',
            $10,
            NOW(),
            NOW()
          )
          RETURNING
            member_code,
            prefix,
            first_name,
            last_name,
            full_name,
            arabic_name,
            status,
            registered_at
          `,
          [
            memberCode,
            prefix,
            firstName,
            lastName,
            fullName,
            arabicName,
            phone,
            email,
            lineId,
            consent
          ]
        );

        // ===============================================
        // INSERT ADDRESS
        // ===============================================
        if (
          addressLine ||
          subdistrict ||
          district ||
          province ||
          postalCode
        ) {

          await client.query(
            `
            INSERT INTO public.addresses (
              member_code,
              address_line,
              subdistrict,
              district,
              province,
              postal_code,
              created_at,
              updated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,NOW(),NOW()
            )
            `,
            [
              memberCode,
              addressLine,
              subdistrict,
              district,
              province,
              postalCode
            ]
          );
        }

        await client.query("COMMIT");
        inTransaction = false;

        return json(request, {
          success: true,
          message: "สมัครสมาชิกเรียบร้อยแล้ว",
          member_code: memberCode,
          data: memberResult.rows[0]
        }, 201);
      }

      // =====================================================
      // ADMIN MEMBER LIST
      // GET /api/admin/members
      // =====================================================
      if (
        path === "/api/admin/members" &&
        request.method === "GET"
      ) {

        if (!isAdmin(request, env)) {
          return adminDenied(request, env);
        }

        const search = clean(
          url.searchParams.get("search")
        );

        const status = clean(
          url.searchParams.get("status")
        );

        const limit = Math.min(
          Math.max(
            Number(url.searchParams.get("limit")) || 20,
            1
          ),
          100
        );

        const offset = Math.max(
          Number(url.searchParams.get("offset")) || 0,
          0
        );

        const result = await client.query(
          `
          SELECT
            member_code,
            prefix,
            first_name,
            last_name,
            full_name,
            arabic_name,
            phone,
            email,
            line_id,
            status,
            member_start,
            member_expire,
            registered_at,
            COUNT(*) OVER()::int AS total_count
          FROM public.members
          WHERE
            (
              $1::text IS NULL
              OR member_code ILIKE '%' || $1 || '%'
              OR full_name ILIKE '%' || $1 || '%'
              OR phone ILIKE '%' || $1 || '%'
              OR email ILIKE '%' || $1 || '%'
            )
            AND
            (
              $2::text IS NULL
              OR status = $2
            )
          ORDER BY registered_at DESC
          LIMIT $3
          OFFSET $4
          `,
          [
            search,
            status,
            limit,
            offset
          ]
        );

        const total =
          result.rows.length > 0
            ? Number(result.rows[0].total_count || 0)
            : 0;

        const rows = result.rows.map(row => {
          const {
            total_count,
            ...member
          } = row;

          return member;
        });

        return json(request, {
          success: true,
          total,
          limit,
          offset,
          data: rows
        });
      }

      // =====================================================
      // ADMIN MEMBER DETAIL
      // GET /api/admin/members/:memberCode
      // =====================================================
      if (
        path.startsWith("/api/admin/members/") &&
        request.method === "GET"
      ) {

        if (!isAdmin(request, env)) {
          return adminDenied(request, env);
        }

        const memberCode = decodeURIComponent(
          path.substring("/api/admin/members/".length)
        ).trim();

        const result = await client.query(
          `
          SELECT
            m.member_code,
            m.prefix,
            m.first_name,
            m.last_name,
            m.full_name,
            m.arabic_name,
            m.phone,
            m.email,
            m.line_id,
            m.status,
            m.member_start,
            m.member_expire,
            m.photo_url,
            m.consent,
            m.registered_at,
            m.updated_at,

            a.address_line,
            a.subdistrict,
            a.district,
            a.province,
            a.postal_code

          FROM public.members AS m

          LEFT JOIN public.addresses AS a
            ON a.member_code = m.member_code

          WHERE m.member_code = $1
          LIMIT 1
          `,
          [memberCode]
        );

        if (result.rows.length === 0) {
          return json(request, {
            success: false,
            message: "ไม่พบข้อมูลสมาชิก"
          }, 404);
        }

        return json(request, {
          success: true,
          data: result.rows[0]
        });
      }

      // =====================================================
      // ADMIN UPDATE MEMBER
      // PATCH /api/admin/members/:memberCode
      // =====================================================
      if (
        path.startsWith("/api/admin/members/") &&
        request.method === "PATCH"
      ) {

        if (!isAdmin(request, env)) {
          return adminDenied(request, env);
        }

        const memberCode = decodeURIComponent(
          path.substring("/api/admin/members/".length)
        ).trim();

        let body;

        try {
          body = await request.json();
        } catch {
          return json(request, {
            success: false,
            message: "รูปแบบข้อมูลไม่ถูกต้อง"
          }, 400);
        }

        const prefix = clean(body.prefix);
        const firstName = clean(body.first_name);
        const lastName = clean(body.last_name);
        const arabicName = clean(body.arabic_name);

        const phone = clean(body.phone);
        const email = clean(body.email);
        const lineId = clean(body.line_id);

        const addressLine = clean(body.address_line);
        const subdistrict = clean(body.subdistrict);
        const district = clean(body.district);
        const province = clean(body.province);
        const postalCode = clean(body.postal_code);

        if (
          email &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          return json(request, {
            success: false,
            message: "รูปแบบอีเมลไม่ถูกต้อง"
          }, 400);
        }

        const existing = await client.query(
          `
          SELECT
            prefix,
            first_name,
            last_name
          FROM public.members
          WHERE member_code = $1
          LIMIT 1
          `,
          [memberCode]
        );

        if (existing.rows.length === 0) {
          return json(request, {
            success: false,
            message: "ไม่พบข้อมูลสมาชิก"
          }, 404);
        }

        const old = existing.rows[0];

        const finalPrefix =
          prefix ?? old.prefix;

        const finalFirstName =
          firstName ?? old.first_name;

        const finalLastName =
          lastName ?? old.last_name;

        const fullName = [
          finalPrefix,
          finalFirstName,
          finalLastName
        ]
          .filter(Boolean)
          .join(" ");

        const duplicate = await client.query(
          `
          SELECT
            member_code
          FROM public.members
          WHERE member_code <> $1
            AND (
              ($2::text IS NOT NULL AND phone = $2)
              OR
              (
                $3::text IS NOT NULL
                AND LOWER(email) = LOWER($3)
              )
            )
          LIMIT 1
          `,
          [
            memberCode,
            phone,
            email
          ]
        );

        if (duplicate.rows.length > 0) {
          return json(request, {
            success: false,
            duplicate: true,
            message: "เบอร์โทรศัพท์หรืออีเมลนี้ถูกใช้งานแล้ว",
            member_code: duplicate.rows[0].member_code
          }, 409);
        }

        await client.query("BEGIN");
        inTransaction = true;

        const updateResult = await client.query(
          `
          UPDATE public.members
          SET
            prefix = COALESCE($2, prefix),
            first_name = COALESCE($3, first_name),
            last_name = COALESCE($4, last_name),
            full_name = $5,
            arabic_name = COALESCE($6, arabic_name),
            phone = COALESCE($7, phone),
            email = COALESCE($8, email),
            line_id = COALESCE($9, line_id),
            updated_at = NOW()
          WHERE member_code = $1
          RETURNING
            member_code,
            prefix,
            first_name,
            last_name,
            full_name,
            arabic_name,
            phone,
            email,
            line_id,
            status,
            member_start,
            member_expire,
            updated_at
          `,
          [
            memberCode,
            prefix,
            firstName,
            lastName,
            fullName,
            arabicName,
            phone,
            email,
            lineId
          ]
        );

        if (
          addressLine ||
          subdistrict ||
          district ||
          province ||
          postalCode
        ) {

          await client.query(
            `
            INSERT INTO public.addresses (
              member_code,
              address_line,
              subdistrict,
              district,
              province,
              postal_code,
              created_at,
              updated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,NOW(),NOW()
            )
            ON CONFLICT (member_code)
            DO UPDATE SET
              address_line = COALESCE(EXCLUDED.address_line, public.addresses.address_line),
              subdistrict = COALESCE(EXCLUDED.subdistrict, public.addresses.subdistrict),
              district = COALESCE(EXCLUDED.district, public.addresses.district),
              province = COALESCE(EXCLUDED.province, public.addresses.province),
              postal_code = COALESCE(EXCLUDED.postal_code, public.addresses.postal_code),
              updated_at = NOW()
            `,
            [
              memberCode,
              addressLine,
              subdistrict,
              district,
              province,
              postalCode
            ]
          );
        }

        await client.query("COMMIT");
        inTransaction = false;

        return json(request, {
          success: true,
          message: "แก้ไขข้อมูลสมาชิกเรียบร้อยแล้ว",
          data: updateResult.rows[0]
        });
      }

      // =====================================================
      // ADMIN APPROVE MEMBER
      // POST /api/admin/members/:memberCode/approve
      // =====================================================
      if (
        path.startsWith("/api/admin/members/") &&
        path.endsWith("/approve") &&
        request.method === "POST"
      ) {

        if (!isAdmin(request, env)) {
          return adminDenied(request, env);
        }

        const memberCode = decodeURIComponent(
          path
            .replace("/api/admin/members/", "")
            .replace("/approve", "")
        ).trim();

        const result = await client.query(
          `
          UPDATE public.members
          SET
            status = 'active',
            member_start = CURRENT_DATE,
            member_expire = CURRENT_DATE + INTERVAL '1 year',
            updated_at = NOW()
          WHERE member_code = $1
          RETURNING
            member_code,
            full_name,
            status,
            member_start,
            member_expire
          `,
          [memberCode]
        );

        if (result.rows.length === 0) {
          return json(request, {
            success: false,
            message: "ไม่พบข้อมูลสมาชิก"
          }, 404);
        }

        return json(request, {
          success: true,
          message: "อนุมัติสมาชิกเรียบร้อยแล้ว",
          data: result.rows[0]
        });
      }

      // =====================================================
      // ADMIN CANCEL MEMBER
      // POST /api/admin/members/:memberCode/cancel
      // =====================================================
      if (
        path.startsWith("/api/admin/members/") &&
        path.endsWith("/cancel") &&
        request.method === "POST"
      ) {

        if (!isAdmin(request, env)) {
          return adminDenied(request, env);
        }

        const memberCode = decodeURIComponent(
          path
            .replace("/api/admin/members/", "")
            .replace("/cancel", "")
        ).trim();

        const result = await client.query(
          `
          UPDATE public.members
          SET
            status = 'cancelled',
            updated_at = NOW()
          WHERE member_code = $1
          RETURNING
            member_code,
            full_name,
            status
          `,
          [memberCode]
        );

        if (result.rows.length === 0) {
          return json(request, {
            success: false,
            message: "ไม่พบข้อมูลสมาชิก"
          }, 404);
        }

        return json(request, {
          success: true,
          message: "ยกเลิกสมาชิกเรียบร้อยแล้ว",
          data: result.rows[0]
        });
      }

      // =====================================================
      // PUBLIC MEMBER LOOKUP
      // GET /api/members/:memberCode
      //
      // ต้องอยู่หลัง /register และ admin routes
      // =====================================================
      if (
        path.startsWith("/api/members/") &&
        request.method === "GET"
      ) {

        const memberCode = decodeURIComponent(
          path.substring("/api/members/".length)
        ).trim();

        if (!memberCode) {
          return json(request, {
            success: false,
            message: "กรุณาระบุรหัสสมาชิก"
          }, 400);
        }

        const result = await client.query(
          `
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

          FROM public.members AS m

          LEFT JOIN public.addresses AS a
            ON a.member_code = m.member_code

          WHERE m.member_code = $1
          LIMIT 1
          `,
          [memberCode]
        );

        if (result.rows.length === 0) {
          return json(request, {
            success: true,
            found: false,
            member_code: memberCode,
            message: "ไม่พบข้อมูลสมาชิก"
          });
        }

        const member = result.rows[0];

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

      if (inTransaction) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {}
      }

      console.error(
        "SK Alumni API ERROR:",
        error?.message || error
      );

      return json(request, {
        success: false,
        message: "เกิดข้อผิดพลาดในการทำงานของระบบ"
      }, 500);

    } finally {

      try {
        await client.end();
      } catch (_) {}

    }
  }
};
