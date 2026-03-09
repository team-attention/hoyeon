import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

// Helper to generate unique emails per test to avoid duplicate conflicts with singleton store
let emailCounter = 0;
function uniqueEmail(): string {
  emailCounter += 1;
  return `testuser${emailCounter}@example.com`;
}

// Helper to register a user and return { email, token, userId }
async function registerUser(email: string, password = 'Password123', name = 'Test User') {
  const res = await request(app)
    .post('/users/register')
    .send({ email, password, name });
  const token: string = res.body.token;
  const userId: string = res.body.user?.id;
  return { email, password, token, userId, res };
}

describe('Health endpoints', () => {
  it('GET /health - returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.status).toBe('ok');
  });

  it('GET / - root health check returns ok', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });
});

describe('POST /users/register', () => {
  it('register success - returns 201 with user and token', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/users/register')
      .send({ email, password: 'Password123', name: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe('Alice');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('register duplicate email - returns 400', async () => {
    const email = uniqueEmail();
    await registerUser(email);

    const res = await request(app)
      .post('/users/register')
      .send({ email, password: 'AnotherPass1', name: 'Bob' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('register validation error - missing required fields returns 400', async () => {
    const res = await request(app)
      .post('/users/register')
      .send({ email: 'incomplete@example.com' }); // missing password and name

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    // validation middleware returns 'Validation failed'
    expect(res.body.error).toBe('Validation failed');
  });

  it('register validation error - invalid email format returns 400', async () => {
    const res = await request(app)
      .post('/users/register')
      .send({ email: 'not-an-email', password: 'Password123', name: 'Charlie' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

describe('POST /users/login', () => {
  it('login success - returns 200 with token', async () => {
    const email = uniqueEmail();
    await registerUser(email, 'MySecret99');

    const res = await request(app)
      .post('/users/login')
      .send({ email, password: 'MySecret99' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('login wrong password - returns 400', async () => {
    const email = uniqueEmail();
    await registerUser(email, 'CorrectPass1');

    const res = await request(app)
      .post('/users/login')
      .send({ email, password: 'WrongPass99' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('login unknown email - returns 400', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ email: 'nobody@example.com', password: 'AnyPass99' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /users - list users (auth required)', () => {
  it('GET /users unauthorized - returns 401 without token', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /users authenticated - returns 200 with user list', async () => {
    const email = uniqueEmail();
    const { token } = await registerUser(email);

    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
    // Registered user should be in the list
    const found = res.body.users.find((u: { email: string }) => u.email === email);
    expect(found).toBeDefined();
  });

  it('GET /users invalid token - returns 401 unauthorized', async () => {
    const res = await request(app)
      .get('/users')
      .set('Authorization', 'Bearer invalidtoken');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /users/:id - get by ID (auth required)', () => {
  it('GET /users/:id authenticated - returns user by id', async () => {
    const email = uniqueEmail();
    const { token, userId } = await registerUser(email);

    const res = await request(app)
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('GET /users/:id - returns 404 for nonexistent user', async () => {
    const email = uniqueEmail();
    const { token } = await registerUser(email);

    const res = await request(app)
      .get('/users/nonexistent-id-12345')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /users/:id unauthorized - returns 401 without token', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser(email);

    const res = await request(app).get(`/users/${userId}`);
    expect(res.status).toBe(401);
  });
});

describe('PUT /users/:id - update user (auth required)', () => {
  it('PUT /users/:id authenticated - updates user name', async () => {
    const email = uniqueEmail();
    const { token, userId } = await registerUser(email, 'Pass123', 'Original Name');

    const res = await request(app)
      .put(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.name).toBe('Updated Name');
  });

  it('PUT /users/:id unauthorized - returns 401 without token', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser(email);

    const res = await request(app)
      .put(`/users/${userId}`)
      .send({ name: 'Hacker' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /users/:id - delete user (auth required)', () => {
  it('DELETE /users/:id authenticated - deletes user', async () => {
    const email = uniqueEmail();
    const { token, userId } = await registerUser(email);

    const res = await request(app)
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('DELETE /users/:id unauthorized - returns 401 without token', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser(email);

    const res = await request(app).delete(`/users/${userId}`);
    expect(res.status).toBe(401);
  });

  it('DELETE /users/:id - returns 404 for nonexistent user', async () => {
    const email = uniqueEmail();
    const { token } = await registerUser(email);

    const res = await request(app)
      .delete('/users/nonexistent-id-99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('Full user flow - register, login, CRUD', () => {
  it('full flow: register → login → get user → update → delete', async () => {
    const email = uniqueEmail();

    // 1. Register
    const registerRes = await request(app)
      .post('/users/register')
      .send({ email, password: 'FlowPass123', name: 'Flow User' });
    expect(registerRes.status).toBe(201);
    const userId = registerRes.body.user.id;

    // 2. Login
    const loginRes = await request(app)
      .post('/users/login')
      .send({ email, password: 'FlowPass123' });
    expect(loginRes.status).toBe(200);
    const token: string = loginRes.body.token;
    expect(token).toBeTruthy();

    // 3. Get user by ID (authenticated)
    const getRes = await request(app)
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.user.email).toBe(email);

    // 4. Update user name (authenticated)
    const updateRes = await request(app)
      .put(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Flow User' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user.name).toBe('Updated Flow User');

    // 5. Delete user (authenticated)
    const deleteRes = await request(app)
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // 6. Verify user no longer exists
    const getAfterDeleteRes = await request(app)
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getAfterDeleteRes.status).toBe(404);
  });
});
