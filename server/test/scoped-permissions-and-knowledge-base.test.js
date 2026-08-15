import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcryptjs from 'bcryptjs';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadId, testerId, adminId;
let leadToken, testerToken, otherTesterToken, adminToken;

beforeAll(async () => {
  const ids = seedTestData(db);
  leadId = ids.leadId; testerId = ids.testerId; adminId = ids.adminId;
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');

  db.prepare(
    'INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)'
  ).run('other-tester@test.local', bcryptjs.hashSync('otherpass123', 4), 'Other Tester', 'tester', 'OT');
  otherTesterToken = await loginAs(request, app, 'other-tester@test.local', 'otherpass123');
});

// Regression coverage for the two features added in commit f58e3f8 that
// shipped with zero test coverage: scoped permission grants and the
// knowledge-base (bug examples / glossary) CRUD they gate.

describe('scoped permissions — authorization boundary', () => {
  it('a plain tester cannot list, grant, or revoke permissions', async () => {
    const list = await request(app).get('/api/lead/permissions').set('Authorization', `Bearer ${testerToken}`);
    expect(list.status).toBe(403);

    const grant = await request(app)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ user_id: testerId, permission: 'manage_knowledge_base' });
    expect(grant.status).toBe(403);
  });

  it('rejects a grant for an unknown permission name', async () => {
    const res = await request(app)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: testerId, permission: 'delete_everything' });
    expect(res.status).toBe(400);
  });

  it('rejects granting to a lead/admin target (no self- or peer-escalation path)', async () => {
    const res = await request(app)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: leadId, permission: 'manage_knowledge_base' });
    expect(res.status).toBe(400);
    expect(db.prepare('SELECT * FROM granted_permissions WHERE user_id = ?').get(leadId)).toBeUndefined();
  });

  // Was a flat 403 — any tester can now *propose* a bug example (see
  // routes/knowledge.js), same shape as the course/guide proposal flow.
  // manage_knowledge_base now gates *direct publish*, not submission itself.
  it('a tester with no grant proposing a bug example gets a pending, unpublished row instead of a 403', async () => {
    const res = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'P', bad_text: 'bad', good_text: 'good' });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_published, proposal_status FROM bug_examples WHERE id = ?').get(res.body.id);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');
  });

  let grantId;
  it('a lead can grant manage_knowledge_base to a tester', async () => {
    const res = await request(app)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: testerId, permission: 'manage_knowledge_base' });
    expect(res.status).toBe(200);
    grantId = res.body.id;

    const mine = await request(app).get('/api/me/permissions').set('Authorization', `Bearer ${testerToken}`);
    expect(mine.body).toContain('manage_knowledge_base');
  });

  it('the granted tester publishes directly; an ungranted tester\'s submission is still forced into a pending proposal', async () => {
    const granted = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'Broken form', bad_text: 'bad example', good_text: 'good example' });
    expect(granted.status).toBe(200);
    const grantedRow = db.prepare('SELECT is_published, proposal_status FROM bug_examples WHERE id = ?').get(granted.body.id);
    expect(grantedRow.is_published).toBe(1);
    expect(grantedRow.proposal_status).toBeNull();

    const ungranted = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${otherTesterToken}`)
      .send({ problem: 'P', bad_text: 'bad', good_text: 'good' });
    expect(ungranted.status).toBe(200);
    const ungrantedRow = db.prepare('SELECT is_published, proposal_status FROM bug_examples WHERE id = ?').get(ungranted.body.id);
    expect(ungrantedRow.is_published).toBe(0);
    expect(ungrantedRow.proposal_status).toBe('pending');
  });

  it('granting the same permission again replaces rather than stacks duplicate rows', async () => {
    const res = await request(app)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: testerId, permission: 'manage_knowledge_base' });
    expect(res.status).toBe(200);
    const rows = db.prepare('SELECT * FROM granted_permissions WHERE user_id = ? AND permission = ?')
      .all(testerId, 'manage_knowledge_base');
    expect(rows).toHaveLength(1);
    grantId = res.body.id;
  });

  it('a lead can revoke a grant, and the tester immediately drops back to proposing instead of publishing directly (no wait for JWT expiry)', async () => {
    const revoke = await request(app)
      .delete(`/api/lead/permissions/${grantId}`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(revoke.status).toBe(200);

    const mine = await request(app).get('/api/me/permissions').set('Authorization', `Bearer ${testerToken}`);
    expect(mine.body).not.toContain('manage_knowledge_base');

    const res = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'P', bad_text: 'bad', good_text: 'good' });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_published, proposal_status FROM bug_examples WHERE id = ?').get(res.body.id);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');
  });

  it('an already-expired grant does not authorize direct publish (expiry is enforced, not just stored)', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    db.prepare(
      'INSERT INTO granted_permissions (user_id, permission, granted_by, expires_at) VALUES (?, ?, ?, ?)'
    ).run(testerId, 'manage_knowledge_base', leadId, past);

    const mine = await request(app).get('/api/me/permissions').set('Authorization', `Bearer ${testerToken}`);
    expect(mine.body).not.toContain('manage_knowledge_base');

    const res = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'P', bad_text: 'bad', good_text: 'good' });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_published, proposal_status FROM bug_examples WHERE id = ?').get(res.body.id);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');
  });

  it('leads and admins bypass the permission system entirely, without needing a grant', async () => {
    const res = await request(app)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ term: 'Flaky test', definition: 'A test that passes/fails nondeterministically.' });
    expect(res.status).toBe(200);
  });

  // Production-readiness audit (deferred item resolved): demoting a lead
  // used not to surface that grants they'd issued to others were still
  // active — the grant itself was never a security hole (it's checked
  // against the *holder's* current role, not the granter's), but an admin
  // had no way to spot "this permission was granted by someone who isn't a
  // lead anymore" without manually cross-referencing. GET /api/lead/permissions
  // now returns granted_by_role so the client can flag it.
  it('demoting the granting lead does not revoke an already-issued grant, but the list now flags who issued it and their current role', async () => {
    const grant = await request(app)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: testerId, permission: 'manage_guides' });
    expect(grant.status).toBe(200);

    const demote = await request(app)
      .patch(`/api/admin/users/${leadId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'tester' });
    expect(demote.status).toBe(200);

    // The grant is still active — checked against the holder's role, not the (now-demoted) granter's.
    const list = await request(app).get('/api/lead/permissions').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const row = list.body.find((r) => r.user_id === testerId && r.permission === 'manage_guides');
    expect(row).toBeTruthy();
    expect(row.granted_by_role).toBe('tester');

    const stillWorks = await request(app)
      .put('/api/guides/999999')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ title: 'x', category: 'x', content: 'x' });
    // 404 (unknown guide), not 403 — proves the grant is still honored server-side.
    expect(stillWorks.status).toBe(404);

    // Restore for any later tests in this file — since authMiddleware now
    // re-checks role from the DB on every request (2026-08-15 audit fix),
    // leaving leadId demoted here would silently strip leadToken's lead
    // access for the rest of the suite, not just this test.
    db.prepare("UPDATE users SET role = 'lead' WHERE id = ?").run(leadId);
  });
});

describe('knowledge base — read access and validation', () => {
  it('any authenticated user (even with no grant) can read bug examples and glossary', async () => {
    const bugs = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(bugs.status).toBe(200);
    expect(Array.isArray(bugs.body)).toBe(true);

    const glossary = await request(app).get('/api/glossary').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(glossary.status).toBe(200);
    expect(Array.isArray(glossary.body)).toBe(true);
  });

  it('sorts terms alphabetically case-insensitively, not by raw byte order', async () => {
    // Byte/binary ordering puts every uppercase letter before every
    // lowercase one, so e.g. "ZQLModule" would sort ahead of "Zebrafish"
    // (byte order: 'Q' 0x51 < 'e' 0x65) even though "Ze" < "ZQ"
    // alphabetically — this is the reported bug ("по алфавиту сортировку в
    // словаре"), fixed via COLLATE NOCASE in the route's ORDER BY.
    // Distinctive nonsense terms — schema.js auto-seeds a handful of real
    // ones (Bug/Console/DOM/DevTools/Viewport) on a fresh DB, so reusing
    // one of those would double up rather than testing anything new.
    for (const term of ['ZQLModule', 'Zebrafish', 'amoeba']) {
      await request(app).post('/api/glossary').set('Authorization', `Bearer ${leadToken}`).send({ term, definition: 'x' });
    }
    const res = await request(app).get('/api/glossary').set('Authorization', `Bearer ${otherTesterToken}`);
    const order = res.body.map(t => t.term).filter(t => ['ZQLModule', 'Zebrafish', 'amoeba'].includes(t));
    expect(order).toEqual(['amoeba', 'Zebrafish', 'ZQLModule']);
  });

  it('rejects a bug example missing required fields', async () => {
    const res = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ problem: '', bad_text: 'bad', good_text: 'good' });
    expect(res.status).toBe(400);
  });

  it('a lead can edit and delete a bug example', async () => {
    const created = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ problem: 'To edit', bad_text: 'bad', good_text: 'good' });
    const id = created.body.id;

    const updated = await request(app)
      .put(`/api/bug-examples/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ problem: 'Edited', bad_text: 'bad2', good_text: 'good2' });
    expect(updated.status).toBe(200);
    expect(db.prepare('SELECT problem FROM bug_examples WHERE id = ?').get(id).problem).toBe('Edited');

    // Delete is a soft-delete (see /api/admin/trash) — the row stays but
    // deleted_at gets set, and it disappears from the normal read route.
    const deleted = await request(app).delete(`/api/bug-examples/${id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(deleted.status).toBe(200);
    expect(db.prepare('SELECT deleted_at FROM bug_examples WHERE id = ?').get(id).deleted_at).not.toBeNull();
    const list = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find((b) => b.id === id)).toBeUndefined();
  });
});
