import "server-only";
import { mockNcClient } from "./mock";
import type { NcClient } from "./types";

export type { NcCharacter, NcClient } from "./types";

/** 실제 NC API 연동 뼈대 (Phase 2에서 구현) */
const realNcClient: NcClient = {
  async listServers() {
    throw new Error("NC API 연동이 아직 구현되지 않았습니다.");
  },
  async searchCharacters() {
    throw new Error("NC API 연동이 아직 구현되지 않았습니다.");
  },
  async getCharacter() {
    throw new Error("NC API 연동이 아직 구현되지 않았습니다.");
  },
};

// NC_API_MODE=real 일 때만 실제 클라이언트 사용. 기본은 Mock.
export const ncClient: NcClient = process.env.NC_API_MODE === "real" ? realNcClient : mockNcClient;
