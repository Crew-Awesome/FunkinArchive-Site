import { betterAuth } from "better-auth"

export type AuthEnv = Env & {
  BETTER_AUTH_SECRET: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

export function createAuth(env: AuthEnv, request: Request, _waitUntil: (promise: Promise<unknown>) => void) {
  return betterAuth({
    appName: "FunkinArchive",
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [
      "https://funkin-archive.pages.dev",
      "https://funkin-commons.pages.dev",
      "https://funkinarchive.immalloy.com",
      "https://funkincommons.immalloy.com",
      "http://localhost:8788",
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["github"],
      },
    },
    socialProviders: env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            scope: ["user:email"],
            requireEmailVerification: true,
          },
        }
      : undefined,
  })
}
