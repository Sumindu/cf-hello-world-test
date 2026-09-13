import type { Context } from "hono";
import type { Env } from "../index";
import { recordVisit } from "../lib/db";
import { renderHomePage } from "../lib/render";
import { listImageKeys } from "../lib/storage";

export async function homeRoute(c: Context<{ Bindings: Env }>) {
  const visitCount = await recordVisit(c.env.DB);
  const imageKeys = await listImageKeys(c.env.IMAGES_KV);
  return c.html(renderHomePage({ visitCount, imageKeys }));
}
