const BASE_URL = 'http://localhost:3001/api';

async function debugTest() {
  // 先登录
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'admin' }),
  });
  const loginData = await loginRes.json();
  console.log('登录:', loginRes.status, loginData.success);
  const token = loginData.data?.token;
  console.log('Token:', token);

  // 测试创建考场
  console.log('\n--- 创建考场测试 ---');
  const roomRes = await fetch(`${BASE_URL}/exam-rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: '测试考场', capacity: 50, location: 'A101' }),
  });
  const roomText = await roomRes.text();
  console.log('状态:', roomRes.status);
  console.log('响应:', roomText);

  // 测试成绩导入
  console.log('\n--- 成绩导入测试 ---');
  const csv = 'student_id,course_id,score\n3,1,55\n4,2,45';
  const importRes = await fetch(`${BASE_URL}/grades/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ csv }),
  });
  const importText = await importRes.text();
  console.log('状态:', importRes.status);
  console.log('响应:', importText);
}

debugTest().catch(console.error);
