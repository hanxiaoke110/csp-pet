// A public, content-free change counter. GitHub uses its existing schedule and
// publisher credentials; the API never stores or sends a GitHub access token.
export const WORKSHOP_PUBLISH_META_KEY = 'workshop_publication_revision';
export async function recordWorkshopPublicationChange(env) {
  await env.DB.prepare(`INSERT INTO meta(key,value) VALUES(?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(meta.value AS INTEGER)+1 AS TEXT)`)
    .bind(WORKSHOP_PUBLISH_META_KEY).run();
}
export async function readWorkshopPublicationRevision(env) {
  const row = await env.DB.prepare('SELECT value FROM meta WHERE key=?').bind(WORKSHOP_PUBLISH_META_KEY).first();
  if (!row) return 0;
  const revision = Number(row.value);
  if (!/^(0|[1-9]\d*)$/.test(row.value) || !Number.isSafeInteger(revision)) throw new Error('Invalid workshop publication revision');
  return revision;
}
export function queueWorkshopPublication(env, ctx) {
  ctx.waitUntil(recordWorkshopPublicationChange(env).catch(() => {
    // The hourly authoritative catalog check recovers edits even if this small
    // background write cannot complete. Never convert a saved upload to failure.
    console.warn('Workshop revision write unavailable; hourly catalog reconciliation remains enabled');
  }));
}
