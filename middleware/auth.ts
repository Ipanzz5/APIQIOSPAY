import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  const bufA = Buffer.alloc(maxLen); Buffer.from(a).copy(bufA);
  const bufB = Buffer.alloc(maxLen); Buffer.from(b).copy(bufB);
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

export function validateBearer(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.substring(7);
  const expected = process.env.API_BEARER_TOKEN || '';
  return !!expected && safeCompare(token, expected);
}

export function withAuth<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    if (!validateBearer(req)) {
      return NextResponse.json(
        { status: 'error', message: 'Unauthorized. Sertakan header: Authorization: Bearer <API_BEARER_TOKEN>' },
        { status: 401 }
      );
    }
    return handler(req, ...args);
  };
}
