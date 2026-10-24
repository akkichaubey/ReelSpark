import { NextResponse } from 'next/server';
import { isGoogleConfigured } from '@/lib/google-auth';

export function GET() {
  return NextResponse.json({ google: isGoogleConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
}
