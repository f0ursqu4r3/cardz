import { z } from 'zod'
import { join } from 'path'
import { randomBytes } from 'crypto'

/**
 * Server configuration schema with validation
 */
const configSchema = z.object({
  // Server port
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(9001)
    .describe('Server port to listen on'),

  // Allowed CORS origins (supports URLs and wildcard patterns like *.example.com)
  allowedOrigins: z
    .string()
    .transform((val) =>
      val
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1)).min(1))
    .optional()
    .describe('Comma-separated list of allowed CORS origins'),

  // Static files directory (relative to server-src)
  staticDir: z.string().default('../dist').describe('Path to static files directory'),

  // Data persistence directory
  dataDir: z
    .string()
    .default(join(process.cwd(), 'data'))
    .describe('Directory for persisted data (rooms, etc.)'),

  // Session secret for signing cookies
  sessionSecret: z
    .string()
    .min(32, 'Session secret must be at least 32 characters')
    .default(randomBytes(32).toString('hex'))
    .describe('Secret key for signing session tokens'),

  // Environment
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
})

export type Config = z.infer<typeof configSchema>

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): Config {
  const raw = {
    port: process.env.PORT,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    staticDir: process.env.STATIC_DIR,
    dataDir: process.env.DATA_DIR,
    sessionSecret: process.env.SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
  }

  const result = configSchema.safeParse(raw)

  if (!result.success) {
    console.error('Configuration validation failed:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }

  return result.data
}

// Export validated config singleton
export const config = loadConfig()

// Log config summary at startup (without secrets)
export function logConfigSummary(): void {
  console.log('Server configuration:')
  console.log(`  Port: ${config.port}`)
  console.log(`  Environment: ${config.nodeEnv}`)
  console.log(`  Static dir: ${config.staticDir}`)
  console.log(`  Data dir: ${config.dataDir}`)
  console.log(`  Allowed origins: ${config.allowedOrigins?.join(', ') ?? '(development mode - all origins)'}`)
  console.log(`  Session secret: ${config.sessionSecret ? '[configured]' : '[auto-generated]'}`)
}
