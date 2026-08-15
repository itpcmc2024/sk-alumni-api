// Trigger Cloudflare first build
import postgres from "postgres";

export default {
  async fetch(request, env, ctx) {
    try {
      const sql = postgres(env.HYPERDRIVE.connectionString, {
        max: 5,
        fetch_types: false
      });

      const result = await sql`
        SELECT
          current_database() AS database,
          current_user AS user,
          version() AS version,
          NOW() AS server_time
      `;

      await sql.end();

      return Response.json({
        success: true,
        message: "SK Alumni PostgreSQL connected successfully",
        data: result
      });

    } catch (error) {
      return Response.json(
        {
          success: false,
          message: "Database connection failed",
          error: error.message
        },
        { status: 500 }
      );
    }
  }
};
