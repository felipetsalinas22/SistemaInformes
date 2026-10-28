import { query } from '../db.js';

export async function writeAudit({ actor, action, entity, entityId = null, detail = {}, ip = null }) {
  try {
    await query(
      `INSERT INTO audit_log (actor_user_id, actor_email, action, entity, entity_id, detail, ip)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        actor?.id || null,
        actor?.email || null,
        action,
        entity,
        entityId === null ? null : String(entityId),
        JSON.stringify(detail || {}),
        ip
      ]
    );
  } catch (error) {
    // La auditoría no debe romper la operación principal, pero sí quedar en el log del servidor.
    console.error('[audit] No se pudo registrar la acción:', action, error.message);
  }
}

export async function writeReportHistory(client, {
  reportId, action, actor, description = ''
}) {
  await client.query(
    `INSERT INTO report_history (report_id, action, actor_user_id, actor_name, actor_role, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [reportId, action, actor.id, actor.full_name, actor.role_name, description]
  );
}
