function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function productionSecret(name: string): string {
  const value = required(name);
  if (process.env.NODE_ENV === "production" && (value.startsWith("change-me") || value.length < 16)) {
    throw new Error(`${name} must be a strong secret (16+ characters) in production`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtAccessSecret: productionSecret("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: productionSecret("JWT_REFRESH_SECRET"),
  uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
};
