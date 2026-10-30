import { NextResponse } from "next/server";
import { addNutritionLog, listNutritionLog } from "@/lib/proot-store";

export async function GET() {
  const log = await listNutritionLog();
  return NextResponse.json(log);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    photo?: string | null;
    at?: string;
  };

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "Meal name is required." },
      { status: 400 }
    );
  }

  const entry = await addNutritionLog({
    name: body.name,
    photo: body.photo ?? null,
    at: body.at,
  });

  return NextResponse.json(entry, { status: 201 });
}
