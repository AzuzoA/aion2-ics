import { withUser } from "@/lib/api";
import { ncClient } from "@/lib/nc";

export async function GET() {
  return withUser(async () => Response.json({ servers: await ncClient.listServers() }));
}
