const BASE = 'http://localhost:3001/api';

async function request(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

async function login(username, password, role) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
  const data = await res.json();
  return data.data?.token;
}

function log(title, data) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
  console.log(JSON.stringify(data, null, 2));
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  PASS: ${msg}`);
}

async function createPendingApplications(adminToken, count) {
  const s1 = await login('student1', 'student123', 'student');
  const s2 = await login('student2', 'student123', 'student');
  const s3 = await login('student3', 'student123', 'student');

  const csv = [
    'studentId,studentName,courseId,courseName,score',
    'student1,Li,MATH101,Math,45',
    'student1,Li,ENG101,Eng,55',
    'student1,Li,CS201,CS,50',
    'student2,Wang,MATH101,Math,40',
    'student2,Wang,ENG101,Eng,58',
    'student3,Zhao,MATH101,Math,42',
    'student3,Zhao,ENG101,Eng,48',
    'student3,Zhao,CS201,CS,52',
  ].join('\n');
  await request('POST', '/grades/import', { csv }, adminToken);

  const students = [
    { idx: 0, token: s1 },
    { idx: 1, token: s2 },
    { idx: 2, token: s3 },
  ];
  const courseIds = [1, 2, 3];
  const created = [];
  const seenKey = new Set();

  const existingBefore = await request('GET', '/applications?status=pending', null, adminToken);
  const existingIds = new Set((existingBefore.data || []).map((a) => a.id));

  let attempts = 0;
  while (created.length < count && attempts < 100) {
    attempts++;
    const s = students[attempts % students.length];
    const courseId = courseIds[Math.floor(attempts / students.length) % courseIds.length];
    const key = `${s.idx}-${courseId}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    const res = await request('POST', '/applications', { courseId }, s.token);
    if (res.success && res.data && !existingIds.has(res.data.id)) {
      created.push(res.data);
    }
  }

  return created;
}

async function main() {
  console.log('\n===== 批量审批事务验证 =====\n');

  const adminToken = await login('admin', 'admin123', 'admin');
  assert(adminToken, '教务登录成功');

  console.log('\n--- 场景1: 5条全过，事务正常提交 ---');

  const pending5 = await createPendingApplications(adminToken, 5);
  assert(pending5.length === 5, `创建5条待审核申请: ${pending5.length}`);
  const ids5 = pending5.map((a) => a.id);

  const before1 = await request('GET', '/applications?status=pending', null, adminToken);
  console.log(`  批量审批前待审核数: ${before1.data?.length || 0}`);

  const res1 = await request('POST', '/applications/batch-approve', { ids: ids5 }, adminToken);
  log('批量审批结果', res1.data);
  assert(res1.success, '批量审批请求成功');
  assert(res1.data.success === 5, `5条全部通过: success=${res1.data.success}`);
  assert(res1.data.skipped === 0, `0条跳过: skipped=${res1.data.skipped}`);
  assert(res1.data.failed === 0, `0条失败: failed=${res1.data.failed}`);

  const after1 = await request('GET', '/applications?status=pending', null, adminToken);
  console.log(`  批量审批后待审核数: ${after1.data?.length || 0}`);
  assert(after1.data?.length === before1.data?.length - 5, '5条审批成功，待审核数减少5');

  for (const id of ids5) {
    const app = await request('GET', `/applications`, null, adminToken);
    const found = (app.data || []).find((a) => a.id === id);
    assert(found && found.status === 'approved', `申请 ${id} 状态为 approved: ${found?.status}`);
    assert(found && found.reviewed_by, `申请 ${id} 已记录审核人: ${found?.reviewed_by}`);
  }
  console.log('  ✅ 事务正常提交，所有5条已更新');

  console.log('\n--- 场景2: 中间1条ID不存在 -> 全部回滚 ---');

  const pending6 = await createPendingApplications(adminToken, 4);
  assert(pending6.length === 4, `创建4条待审核申请: ${pending6.length}`);

  const pendingIds = pending6.map((a) => a.id);
  const fakeId = 99999;
  const mixedIds = [pendingIds[0], pendingIds[1], fakeId, pendingIds[2], pendingIds[3]];
  console.log(`  传入ID: [${mixedIds.join(', ')}] (其中 ${fakeId} 不存在)`);

  const before2 = await request('GET', '/applications?status=pending', null, adminToken);
  console.log(`  批量审批前待审核数: ${before2.data?.length || 0}`);

  const res2 = await request('POST', '/applications/batch-approve', { ids: mixedIds }, adminToken);
  log('含不存在ID的批量审批结果', res2.data);
  assert(res2.success, '批量审批请求成功');
  assert(res2.data.success === 0, `0条通过: success=${res2.data.success}`);
  assert(res2.data.failed === 5, `5条失败: failed=${res2.data.failed}`);

  const after2 = await request('GET', '/applications?status=pending', null, adminToken);
  console.log(`  批量审批后待审核数: ${after2.data?.length || 0}`);
  assert(after2.data?.length === before2.data?.length, '待审核数不变，全部回滚');

  for (const id of pendingIds) {
    const app = await request('GET', `/applications`, null, adminToken);
    const found = (app.data || []).find((a) => a.id === id);
    assert(found && found.status === 'pending', `申请 ${id} 仍为 pending 状态: ${found?.status}`);
  }
  console.log('  ✅ 事务回滚成功，4条有效申请状态未变');

  console.log('\n--- 场景3: 其中1条已被另一教务拒绝 -> 4过1跳过，不回滚 ---');

  const pendingFromScene2 = await request('GET', '/applications?status=pending', null, adminToken);
  const scene2Pending = pendingFromScene2.data || [];
  const additionalNeeded = Math.max(0, 5 - scene2Pending.length);

  let pendingScene3 = [...scene2Pending];
  if (additionalNeeded > 0) {
    const more = await createPendingApplications(adminToken, additionalNeeded);
    pendingScene3 = [...scene2Pending, ...more];
  }
  pendingScene3 = pendingScene3.slice(0, 5);

  assert(pendingScene3.length === 5, `获取5条待审核申请: ${pendingScene3.length}`);

  const idsScene3 = pendingScene3.map((a) => a.id);
  const preRejectId = idsScene3[2];
  console.log(`  先用另一教务拒绝ID=${preRejectId}...`);
  await request('POST', `/applications/${preRejectId}/reject`, { reason: '另一教务先拒' }, adminToken);

  const res3 = await request('POST', '/applications/batch-approve', { ids: idsScene3 }, adminToken);
  log('含已拒绝申请的批量审批结果', res3.data);
  assert(res3.success, '批量审批请求成功');
  assert(res3.data.success === 4, `4条通过: success=${res3.data.success}`);
  assert(res3.data.skipped === 1, `1条跳过: skipped=${res3.data.skipped}`);
  assert(res3.data.failed === 0, `0条失败: failed=${res3.data.failed}`);

  const skipped = res3.data.details.find((d) => d.id === preRejectId);
  assert(skipped && skipped.status === 'skipped', `ID=${preRejectId} 被跳过: ${skipped?.status}`);
  console.log(`  跳过原因: "${skipped?.reason}"`);
  assert(skipped?.reason?.includes('已被其他教务处理'), '跳过原因正确');

  for (const id of idsScene3) {
    if (id === preRejectId) continue;
    const app = await request('GET', `/applications`, null, adminToken);
    const found = (app.data || []).find((a) => a.id === id);
    assert(found && found.status === 'approved', `申请 ${id} 状态为 approved: ${found?.status}`);
  }
  console.log('  ✅ 冲突跳过不影响其他，4条成功，1条跳过');

  console.log('\n--- 场景4: 批量拒绝事务验证 ---');

  const pendingAll = await request('GET', '/applications?status=pending', null, adminToken);
  const existingPending = pendingAll.data || [];
  let pendingReject = [...existingPending];
  if (pendingReject.length < 5) {
    const more = await createPendingApplications(adminToken, 5 - pendingReject.length);
    pendingReject = [...pendingReject, ...more];
  }
  pendingReject = pendingReject.slice(0, 5);
  assert(pendingReject.length === 5, `获取5条待审核申请: ${pendingReject.length}`);
  const rejectIds = pendingReject.map((a) => a.id);

  const res4 = await request('POST', '/applications/batch-reject', { ids: rejectIds, reason: '批量拒绝测试' }, adminToken);
  log('批量拒绝结果', res4.data);
  assert(res4.success, '批量拒绝请求成功');
  assert(res4.data.success === 5, `5条全部拒绝: success=${res4.data.success}`);

  for (const id of rejectIds) {
    const app = await request('GET', `/applications`, null, adminToken);
    const found = (app.data || []).find((a) => a.id === id);
    assert(found && found.status === 'rejected', `申请 ${id} 状态为 rejected: ${found?.status}`);
  }
  console.log('  ✅ 批量拒绝事务正常提交');

  console.log('\n--- 场景5: 批量拒绝含不存在ID -> 全部回滚 ---');

  const pendingAfter4 = await request('GET', '/applications?status=pending', null, adminToken);
  const existingAfter4 = pendingAfter4.data || [];
  let pendingReject2 = [...existingAfter4];
  if (pendingReject2.length < 3) {
    const more = await createPendingApplications(adminToken, 3 - pendingReject2.length);
    pendingReject2 = [...pendingReject2, ...more];
  }
  pendingReject2 = pendingReject2.slice(0, 3);
  assert(pendingReject2.length === 3, `获取3条待审核申请: ${pendingReject2.length}`);
  const rejectIds2 = [...pendingReject2.map((a) => a.id), 88888];

  const before5 = await request('GET', '/applications?status=pending', null, adminToken);
  const res5 = await request('POST', '/applications/batch-reject', { ids: rejectIds2, reason: '测试' }, adminToken);
  log('批量拒绝含不存在ID结果', res5.data);
  assert(res5.data.failed === 4, `4条失败: failed=${res5.data.failed}`);
  const after5 = await request('GET', '/applications?status=pending', null, adminToken);
  assert(after5.data?.length === before5.data?.length, '待审核数不变，全部回滚');
  console.log('  ✅ 批量拒绝含失败，全部回滚');

  console.log('\n\n' + '='.repeat(70));
  console.log('  事务验证全部通过！');
  console.log('='.repeat(70));
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
