import { execSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  process.loadEnvFile(path.resolve(__dirname, "../.env.test"));
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });
}
