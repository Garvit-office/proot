import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/proot-store";

export async function GET() {
  const catalog = await getCatalog();
  return NextResponse.json(catalog);
}
