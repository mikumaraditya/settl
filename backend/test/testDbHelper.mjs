import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Validates and returns the isolated test database configuration.
 * - Requires MONGO_URI_TEST to be set in environment or backend/.env.
 * - Parses both MONGO_URI_TEST and MONGO_URI using the standard URL class.
 * - Extracts database names (pathname without leading slash).
 * - Refuses to run unless testDbName ends with "_test" and differs from devDbName.
 * - Never prints connection strings or credentials.
 */
export function getTestDbConfig() {
  const testUri = process.env.MONGO_URI_TEST;
  if (!testUri) {
    console.error("❌ Fatal: MONGO_URI_TEST is missing from environment and backend/.env. Tests require an isolated test database.");
    process.exit(1);
  }

  let testDbName;
  try {
    const parsedTest = new URL(testUri);
    testDbName = parsedTest.pathname.replace(/^\//, "");
  } catch (err) {
    console.error("❌ Fatal: Failed to parse MONGO_URI_TEST using URL class:", err.message);
    process.exit(1);
  }

  if (!testDbName || !testDbName.endsWith("_test")) {
    console.error(`❌ Safety Check Failed: Test database name "${testDbName || ""}" must end with "_test". Refusing to run.`);
    process.exit(1);
  }

  const devUri = process.env.MONGO_URI;
  if (devUri) {
    let devDbName;
    try {
      const parsedDev = new URL(devUri);
      devDbName = parsedDev.pathname.replace(/^\//, "");
    } catch {
      // Dev URI could not be parsed as standard URL
    }

    if (devDbName && testDbName === devDbName) {
      console.error(`❌ Safety Check Failed: Test database name "${testDbName}" matches development database name "${devDbName}". Refusing to run.`);
      process.exit(1);
    }
  }

  return { testUri, testDbName };
}
