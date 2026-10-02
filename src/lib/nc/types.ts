import type { CharacterClass } from "../classes";

/** NC API에서 가져오는 캐릭터 정보 */
export interface NcCharacter {
  server: string;
  name: string;
  class: CharacterClass;
  level: number;
  combatPower: number;
}

/** NC API 클라이언트. 실제 API 사양이 나오면 RealNcClient를 구현해 교체한다. */
export interface NcClient {
  listServers(): Promise<string[]>;
  searchCharacters(server: string, keyword: string): Promise<NcCharacter[]>;
  getCharacter(server: string, name: string): Promise<NcCharacter | null>;
}
