import "server-only";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUser, upsertUserByDiscord, type UserRow } from "./members";

// Discord 앱 없이 로컬에서 테스트하기 위한 개발용 로그인 (production에서는 항상 비활성)
export const devLoginEnabled =
  process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

const providers: NextAuthOptions["providers"] = [
  DiscordProvider({
    clientId: process.env.DISCORD_CLIENT_ID ?? "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  }),
];

if (devLoginEnabled) {
  providers.push(
    CredentialsProvider({
      id: "dev",
      name: "개발용 로그인",
      credentials: { name: { label: "이름", type: "text" } },
      authorize(credentials) {
        const name = credentials?.name?.trim();
        if (!name) return null;
        return { id: `dev:${name}`, name };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    // 로그인 시점에 DB 유저를 생성/갱신하고 내부 user id를 토큰에 담는다
    async jwt({ token, account, user }) {
      if (account) {
        const discordId =
          account.provider === "discord" ? account.providerAccountId : String(user.id);
        const dbUser = upsertUserByDiscord(discordId, user.name ?? "이름없음", user.image ?? null);
        token.uid = dbUser.id;
        token.discordId = dbUser.discord_id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.discordId = token.discordId;
      }
      return session;
    },
  },
};

/** 현재 로그인한 유저. 세션이 없거나 DB에 유저가 없으면 null. */
export async function getCurrentUser(): Promise<UserRow | null> {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return null;
  const user = getUser(uid);
  // DB가 초기화되어 id가 재사용된 경우 다른 사람으로 로그인되지 않도록 discord_id까지 확인
  if (!user || user.discord_id !== session.user?.discordId) return null;
  return user;
}

/** 개발자 전용 페이지 접근 가능 여부 (환경변수 DEV_DISCORD_IDS에 등록된 Discord ID) */
export function isDeveloper(user: UserRow): boolean {
  const ids = (process.env.DEV_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(user.discord_id);
}
