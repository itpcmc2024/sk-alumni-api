import pg from "pg";

const { Client } = pg;

export default {
  async fetch(request, env, ctx) {
    const client = new Client({
      connectionString: env.HYPERDRIVE.connectionString,
    });

    try {
      await client.connect();

      const result = await client.query(`
        SELECT
          current_database() AS database,
          current_user AS "user",
          version() AS version,
          NOW() AS server_time
      `);

      return Response.json({
        success: true,
        message: "SK Alumni PostgreSQL connected successfully",
        data: result.rows,
      });

    } catch (error) {
      console.error("Database error:", error);

      return Response.json(
        {
          success: false,
          message: "Database connection failed",
          error: error.message,
        },
        { status: 500 }
      );

    } finally {
      await client.end().catch(() => {});
    }
  },
};
