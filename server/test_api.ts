async function test() {
  try {
    console.log('Logging in...');
    const loginRes = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'college@example.com',
        password: 'password'
      })
    });
    const loginData: any = await loginRes.json();
    const token = loginData.token;
    console.log('Login success. Token obtained.');

    console.log('Generating test...');
    const genRes = await fetch('http://localhost:4000/tests/generate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({
        testType: 'mixed',
        questionCount: 5,
        timeLimitMin: 10,
        difficulty: 1
      })
    });

    const genData: any = await genRes.json();
    if (!genRes.ok) {
      console.error('API Error:', genRes.status, genData);
    } else {
      console.log('Test generated successfully:', genData.testSessionKey);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

test();
