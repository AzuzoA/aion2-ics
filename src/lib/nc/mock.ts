import "server-only";
import { CLASSES } from "../classes";
import type { NcCharacter, NcClient } from "./types";

// 실제 서버 목록이 아닌 Mock 데이터
const SERVERS = ["이스라펠", "네자칸", "지켈", "바이젤", "트리니엘", "카이시넬", "루미엘", "아스펠"];

// 검색어에 덧붙여 결과를 만들어내는 접미/접두어
const VARIANTS = [(k: string) => k, (k: string) => `${k}2`, (k: string) => `${k}님`, (k: string) => `작은${k}`, (k: string) => `${k}의검`];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 문자열 → 결정적 정수 해시 (같은 캐릭터는 항상 같은 정보를 돌려주기 위함) */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

function fakeCharacter(server: string, name: string): NcCharacter {
  const h = hash(`${server}/${name}`);
  return {
    server,
    name,
    class: CLASSES[h % CLASSES.length],
    level: 30 + (h % 26), // 30~55
    combatPower: 1500 + ((h >>> 8) % 2500), // 1500~3999
  };
}

export const mockNcClient: NcClient = {
  async listServers() {
    return SERVERS;
  },

  async searchCharacters(server, keyword) {
    await delay(300); // 네트워크 지연 흉내
    const k = keyword.trim();
    if (!SERVERS.includes(server) || !k) return [];
    // 서버마다 검색 결과 개수가 다르게 보이도록 해시로 일부만 노출
    const count = 1 + (hash(server + k) % VARIANTS.length);
    return VARIANTS.slice(0, count).map((v) => fakeCharacter(server, v(k)));
  },

  async getCharacter(server, name) {
    await delay(200);
    if (!SERVERS.includes(server) || !name.trim()) return null;
    return fakeCharacter(server, name.trim());
  },
};
