import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ownsProject, requireProjectAccess } from '../src/lib/project-access';
import type { Project } from '../src/lib/types';
import type { UserProfile } from '../src/lib/auth';

async function main() {
  const prior = process.env.ALLOW_DEMO_LOGIN;
  process.env.ALLOW_DEMO_LOGIN = 'false';
  try {
    const alice = { id: 'alice' } as UserProfile;
    const bob = { id: 'bob' } as UserProfile;
    const project = { ownerUserId: 'alice' } as Project;
    assert.equal(ownsProject(alice, project), true);
    assert.equal(ownsProject(bob, project), false);
    assert.equal(ownsProject(alice, {} as Project), false);
    const request = new NextRequest('http://localhost/api/projects/test');
    assert.equal((await requireProjectAccess(request, 'test'))?.status, 401);
    const list = await import('../src/app/api/projects/route');
    assert.equal((await list.GET(request)).status, 401);
    assert.equal((await list.POST(new NextRequest(request.url, { method: 'POST' }))).status, 401);
    const detail = await import('../src/app/api/projects/[id]/route');
    const context = { params: Promise.resolve({ id: 'test' }) };
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      assert.equal((await detail[method](new NextRequest(request.url, { method }), context)).status, 401);
    }
    console.log('PASS: owner/other-user/ownerless policy and anonymous project list/create/read/update/delete rejection');
  } finally {
    if (prior === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = prior;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
