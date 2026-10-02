// 직업 → 역할 매핑 (PRD 2장 "직업 분류")
export const ROLES = ["tank", "dealer", "support"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  tank: "탱커",
  dealer: "딜러",
  support: "서포터",
};

export const CLASS_ROLES = {
  수호성: "tank",
  검성: "tank",
  궁성: "dealer",
  마도성: "dealer",
  정령성: "dealer",
  살성: "dealer",
  권성: "dealer",
  호법성: "support",
  치유성: "support",
} as const satisfies Record<string, Role>;

export type CharacterClass = keyof typeof CLASS_ROLES;
export const CLASSES = Object.keys(CLASS_ROLES) as CharacterClass[];

export function isCharacterClass(value: unknown): value is CharacterClass {
  return typeof value === "string" && value in CLASS_ROLES;
}
