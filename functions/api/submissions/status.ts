import { readModerationSettings } from "../../_shared/admin"

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const settings = await readModerationSettings(env.DB)
  return Response.json({ submissionsLocked: settings.submissionsLocked }, {
    headers: { "Cache-Control": "no-store" },
  })
}
