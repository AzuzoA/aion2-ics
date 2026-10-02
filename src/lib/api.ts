import "server-only";
import { getCurrentUser } from "./auth";
import { ConflictError, NotFoundError, ValidationError, type UserRow } from "./members";

export function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/** 로그인 필수 핸들러 래퍼. 도메인 에러를 HTTP 상태 코드로 변환한다. */
export async function withUser(handler: (user: UserRow) => Promise<Response> | Response) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "로그인이 필요합니다.");
  try {
    return await handler(user);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(400, e.message);
    if (e instanceof NotFoundError) return jsonError(404, e.message);
    if (e instanceof ConflictError) return jsonError(409, e.message);
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed: accounts")) {
      return jsonError(409, "같은 이름의 계정이 이미 있습니다.");
    }
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed: characters")) {
      return jsonError(409, "이미 등록된 캐릭터입니다.");
    }
    throw e;
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new ValidationError("요청 본문이 올바른 JSON 객체가 아닙니다.");
}

export function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new NotFoundError("잘못된 ID입니다.");
  return id;
}

export function requireString(value: unknown, field: string, maxLength = 30): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field}을(를) 입력하세요.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ValidationError(`${field}은(는) ${maxLength}자 이하여야 합니다.`);
  return trimmed;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new ValidationError(`${field}은(는) boolean이어야 합니다.`);
  return value;
}
