import { NextResponse } from 'next/server';
import { engine } from '../../feature-flags';

export async function POST(request: Request) {
  const body = await request.json();
  const identityKey = body.identityKey as string;
  const overrides = body.overrides ?? {};
  await engine.setUserOverrides(identityKey, overrides);
  return NextResponse.json({ ok: true });
}
