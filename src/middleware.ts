import { NextResponse, type NextRequest } from 'next/server';

/*
 * The front door, answered at the edge.
 *
 * "/" only sends people on — the installed app opens there — but answering it
 * in a server function meant starting one, page layout and all, for every tap
 * on the home-screen icon. A promoter's cookie is enough to send him to his
 * page, and nobody's cookie means the sign-in page; a staff cookie still goes
 * to the page itself, which knows which home a role has. A stale promoter
 * cookie costs nothing: his page sends him to sign in, as it always did.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.has('ops_session')) return NextResponse.next();
  const to = req.cookies.has('ops_member') ? '/me' : '/login';
  return NextResponse.redirect(new URL(to, req.url));
}

export const config = { matcher: '/' };
