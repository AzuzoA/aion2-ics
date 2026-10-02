import "server-only";
import { getDb, transaction } from "./db";

export type AuditAction = "create" | "update" | "delete";
export type AuditTarget = "user" | "account" | "character";

export interface AuditEntry {
  action: AuditAction;
  targetType: AuditTarget;
  targetId: number | null;
  detail?: unknown;
}

export function writeAuditLog(actorId: number, entry: AuditEntry) {
  getDb().prepare(
    `INSERT INTO audit_logs (user_id, action, target_type, target_id, detail)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    actorId,
    entry.action,
    entry.targetType,
    entry.targetId,
    entry.detail === undefined ? null : JSON.stringify(entry.detail),
  );
}

/**
 * 변경 작업과 감사 로그를 하나의 트랜잭션으로 실행한다.
 * fn은 결과값과 기록할 감사 로그 항목을 반환한다.
 */
export function audited<T>(actorId: number, fn: () => { result: T; audit: AuditEntry }): T {
  return transaction(() => {
    const { result, audit } = fn();
    writeAuditLog(actorId, audit);
    return result;
  });
}
