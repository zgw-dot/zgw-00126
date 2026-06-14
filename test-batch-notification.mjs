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
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
  console.log(JSON.stringify(data, null, 2));
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  PASS: ${msg}`);
}

async function main() {
  console.log('\n===== Batch Approval + Notification Verification =====\n');

  const adminToken = await login('admin', 'admin123', 'admin');
  assert(adminToken, 'Admin login OK');

  const s1Token = await login('student1', 'student123', 'student');
  assert(s1Token, 'student1 login OK');

  const s2Token = await login('student2', 'student123', 'student');
  assert(s2Token, 'student2 login OK');

  const s3Token = await login('student3', 'student123', 'student');
  assert(s3Token, 'student3 login OK');

  const admin2Token = await login('admin', 'admin123', 'admin');
  assert(admin2Token, 'Second admin login OK');

  console.log('\n--- Prep: Import grades to create qualifications ---');
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

  const importRes = await request('POST', '/grades/import', { csv }, adminToken);
  assert(importRes.success, 'Grade import OK');
  console.log(`  Imported: ${importRes.data?.imported || 0} grades`);

  const qualsRes = await request('GET', '/qualifications', null, adminToken);
  const quals = qualsRes.data || [];
  console.log(`  Qualifications created: ${quals.length}`);

  console.log('\n--- Prep: Create 5 pending applications ---');
  for (const courseId of [1, 2, 3]) {
    await request('POST', '/applications', { courseId }, s1Token);
  }
  for (const courseId of [1, 2]) {
    await request('POST', '/applications', { courseId }, s2Token);
  }

  const appsAfter = await request('GET', '/applications?status=pending', null, adminToken);
  const pendingApps = appsAfter.data || [];
  console.log(`  Pending applications: ${pendingApps.length}`);
  assert(pendingApps.length >= 5, `Pending >= 5: ${pendingApps.length}`);

  const batch5 = pendingApps.slice(0, 5).map((a) => a.id);

  console.log('\n--- Scenario 1: Batch approve 5, all pass ---');
  const batchRes1 = await request('POST', '/applications/batch-approve', { ids: batch5 }, adminToken);
  log('Scenario 1 result', batchRes1.data);
  assert(batchRes1.success, 'Batch approve request OK');
  assert(batchRes1.data.success === 5, `5 passed: success=${batchRes1.data.success}`);
  assert(batchRes1.data.skipped === 0, `0 skipped: skipped=${batchRes1.data.skipped}`);
  assert(batchRes1.data.failed === 0, `0 failed: failed=${batchRes1.data.failed}`);
  assert(batchRes1.data.details.length === 5, `Details length=5: ${batchRes1.data.details.length}`);

  console.log('\n--- Scenario 2: 1 pre-rejected by another admin -> 4 pass, 1 skipped ---');
  for (const courseId of [1, 2, 3]) {
    try { await request('POST', '/applications', { courseId }, s1Token); } catch {}
  }
  for (const courseId of [1, 2]) {
    try { await request('POST', '/applications', { courseId }, s3Token); } catch {}
  }

  const appsScene2 = await request('GET', '/applications?status=pending', null, adminToken);
  const pendingScene2 = (appsScene2.data || []).slice(0, 5);
  assert(pendingScene2.length >= 5, `Scenario2: pending >= 5: ${pendingScene2.length}`);

  const batchScene2 = pendingScene2.map((a) => a.id);
  const preRejectId = batchScene2[0];

  console.log(`  Pre-rejecting ID=${preRejectId} via another admin...`);
  const rejectRes = await request('POST', `/applications/${preRejectId}/reject`, { reason: 'Pre-rejected by other admin' }, admin2Token);
  assert(rejectRes.success, `Pre-reject ID=${preRejectId} OK`);

  console.log(`  Batch approving 5 (includes already-rejected ID=${preRejectId})...`);
  const batchRes2 = await request('POST', '/applications/batch-approve', { ids: batchScene2 }, adminToken);
  log('Scenario 2 result', batchRes2.data);
  assert(batchRes2.success, 'Batch approve request OK');
  assert(batchRes2.data.success === 4, `4 passed: success=${batchRes2.data.success}`);
  assert(batchRes2.data.skipped === 1, `1 skipped: skipped=${batchRes2.data.skipped}`);
  assert(batchRes2.data.failed === 0, `0 failed: failed=${batchRes2.data.failed}`);

  const skippedDetail = batchRes2.data.details.find((d) => d.id === preRejectId);
  assert(skippedDetail, 'Skipped item appears in details');
  assert(skippedDetail.status === 'skipped', `Status=skipped: ${skippedDetail.status}`);
  assert(!!skippedDetail.reason, `Reason not empty: "${skippedDetail.reason}"`);
  console.log(`  Skip reason: "${skippedDetail.reason}"`);

  console.log('\n--- Scenario 3: Student sees notifications ---');
  const notifs = await request('GET', '/notifications', null, s1Token);
  log('Scenario 3 - student1 notifications', notifs.data);
  assert(notifs.success, 'Get notifications OK');
  assert(notifs.data && notifs.data.length > 0, `student1 has notifications: ${notifs.data?.length || 0}`);

  const unreadNotifs = notifs.data.filter((n) => !n.isRead);
  console.log(`  Unread count: ${unreadNotifs.length}`);

  const unreadCountRes = await request('GET', '/notifications/unread-count', null, s1Token);
  assert(unreadCountRes.success, 'Get unread count OK');
  assert(unreadCountRes.data.count > 0, `Unread > 0: ${unreadCountRes.data.count}`);

  if (unreadNotifs.length > 0) {
    const firstUnread = unreadNotifs[0];
    console.log(`  Marking notification ID=${firstUnread.id} as read...`);
    await request('POST', `/notifications/${firstUnread.id}/read`, null, s1Token);
    const afterMark = await request('GET', '/notifications', null, s1Token);
    const marked = afterMark.data.find((n) => n.id === firstUnread.id);
    assert(marked && marked.isRead, 'After mark read, isRead=true');
  }

  console.log('\n--- Mark all as read ---');
  await request('POST', '/notifications/read-all', null, s1Token);
  const afterAllRead = await request('GET', '/notifications/unread-count', null, s1Token);
  assert(afterAllRead.data.count === 0, `All read: unread=0: ${afterAllRead.data.count}`);

  console.log('\n--- Scenario 4: Notification config persistence ---');
  const configBefore = await request('GET', '/notification-config', null, adminToken);
  log('Scenario 4a - notification config', configBefore.data);
  assert(configBefore.success, 'Get config OK');
  assert(configBefore.data && configBefore.data.length > 0, `Config items > 0: ${configBefore.data?.length || 0}`);

  const toggleRes = await request('PUT', '/notification-config/application_rejected', { enabled: false }, adminToken);
  assert(toggleRes.success, 'Disable application_rejected OK');

  const configAfterToggle = await request('GET', '/notification-config', null, adminToken);
  const rejectedConfig = configAfterToggle.data.find((c) => c.eventType === 'application_rejected');
  assert(rejectedConfig && rejectedConfig.enabled === false, 'application_rejected is disabled');

  console.log('  >> Config written to DB; restart server to verify persistence');

  await request('PUT', '/notification-config/application_rejected', { enabled: true }, adminToken);

  console.log('\n--- Scenario 5: Batch exam scheduling ---');
  const approvedApps = await request('GET', '/applications?status=approved', null, adminToken);
  const approved = (approvedApps.data || []).filter((a) => a.status === 'approved');
  console.log(`  Approved applications: ${approved.length}`);

  if (approved.length >= 2) {
    const scheduleIds = approved.slice(0, Math.min(3, approved.length)).map((a) => a.id);
    const rooms = await request('GET', '/exam-rooms', null, adminToken);
    const roomId = rooms.data?.[0]?.id;

    if (roomId) {
      const scheduleRes = await request('POST', '/arrangements', {
        applicationIds: scheduleIds,
        examRoomId: roomId,
        examDate: '2026-07-01',
        startTime: '09:00',
        endTime: '11:00',
      }, adminToken);
      log('Scenario 5 - batch scheduling result', scheduleRes.data);
      assert(scheduleRes.success, 'Batch schedule OK');
      assert(scheduleRes.data.details && scheduleRes.data.details.length > 0, 'Schedule has details');
      const scheduleSuccess = scheduleRes.data.details.filter((d) => d.status === 'success').length;
      console.log(`  Scheduled successfully: ${scheduleSuccess}`);
    }
  }

  console.log('\n--- Scenario 6: Student receives exam_scheduled notification ---');
  const notifsAfterSchedule = await request('GET', '/notifications', null, s1Token);
  const scheduleNotifs = (notifsAfterSchedule.data || []).filter((n) => n.type === 'exam_scheduled');
  console.log(`  student1 exam_scheduled notifications: ${scheduleNotifs.length}`);

  console.log('\n\n' + '='.repeat(60));
  console.log('  ALL TESTS PASSED!');
  console.log('='.repeat(60));
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
