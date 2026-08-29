import { handleApiRequest } from "../../server/core/api.mjs";
import { D1Adapter } from "../../server/db/d1.mjs";

export async function onRequest(context) {
  return handleApiRequest(context.request, new D1Adapter(context.env.DB));
}
