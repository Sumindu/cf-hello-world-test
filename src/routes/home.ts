import type { Context } from "hono";
import type { Env } from "../index";
import { recordVisit } from "../lib/db";
import { renderHomePage } from "../lib/render";

export async function homeRoute(c: Context<{ Bindings: Env }>) {
  const visitCount = await recordVisit(c.env.DB);
  return c.html(renderHomePage({ visitCount, imageKeys: [] }));
}
