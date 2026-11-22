/**
 * Test Suite: Multi-Factor Authentication (MFA), Forgot Password, and Strong Password Policy
 */
// Ensure development mode for test suite
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_automated_testing_32chars_long';
process.env.ALLOW_DEMO_MODE = 'true';
jest.setTimeout(30000);

const request = require('supertest');
const app = require('../server');
const emailService = require('../services/emailService');
const { validatePasswordStrength } = require('../utils/passwordValidator');

describe('Notivexa Security Suite: Strong Password, MFA, and Forgot Password', () => {
  const testEmail = `sec_user_${Date.now()}@notivexa.test`;
  const strongPassword = 'StrongPass12!';
  const updatedPassword = 'NewSecretPass88#';
  let sessionToken = null;
  let userMfaTempToken = null;

  describe('1. Strong Password Policy Validator', () => {
    it('Requires minimum 7 characters total', () => {
      const result = validatePasswordStrength('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.rules.length).toBe(false);
    });

    it('Requires minimum 4 letters [a-zA-Z]', () => {
      const result = validatePasswordStrength('Abc12345!@#');
      expect(result.valid).toBe(false);
      expect(result.rules.letters).toBe(false);
    });

    it('Requires minimum 2 numbers [0-9]', () => {
      const result = validatePasswordStrength('ValidLetters1!');
      expect(result.valid).toBe(false);
      expect(result.rules.numbers).toBe(false);
    });

    it('Requires minimum 1 special key', () => {
      const result = validatePasswordStrength('ValidLetters12');
      expect(result.valid).toBe(false);
      expect(result.rules.special).toBe(false);
    });

    it('Accepts passwords satisfying 4+ letters, 2+ numbers, 1+ special key, 7+ chars', () => {
      expect(validatePasswordStrength('Test12!').valid).toBe(true);
      expect(validatePasswordStrength('Notivexa2026@Pass').valid).toBe(true);
      expect(validatePasswordStrength('Secret99$').valid).toBe(true);
    });
  });

  describe('2. User Registration & Password Enforcement', () => {
    it('Rejects registration with weak password lacking special characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Weak User',
          email: `weak_${Date.now()}@notivexa.test`,
          password: 'Password123' // Missing special character
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/special key/i);
    });

    it('Rejects registration with weak password lacking 2 numbers', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Weak User',
          email: `weak_${Date.now()}@notivexa.test`,
          password: 'Password1!' // Only 1 number
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 2 numbers/i);
    });

    it('Successfully registers user with strong password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'MFA User',
          email: testEmail,
          password: strongPassword
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      sessionToken = res.body.token;
    });
  });

  describe('3. Forgot Password Flow with Email OTP', () => {
    let capturedResetOtp = null;

    it('Dispatches a 6-digit OTP to user email on forgot password request', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const recent = emailService.getRecentOtp(testEmail);
      expect(recent).toBeDefined();
      expect(recent.type).toBe('password_reset');
      expect(recent.otp).toMatch(/^\d{6}$/);
      capturedResetOtp = recent.otp;
    });

    it('Verifies OTP validity before allowing password reset', async () => {
      // Invalid OTP fails
      const badRes = await request(app)
        .post('/api/auth/verify-reset-otp')
        .send({ email: testEmail, otp: '000000' });
      expect(badRes.status).toBe(400);

      // Correct OTP succeeds
      const goodRes = await request(app)
        .post('/api/auth/verify-reset-otp')
        .send({ email: testEmail, otp: capturedResetOtp });
      expect(goodRes.status).toBe(200);
      expect(goodRes.body.success).toBe(true);
    });

    it('Rejects reset password if new password does not meet strong policy', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: testEmail,
          otp: capturedResetOtp,
          newPassword: 'weakpassword'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('Successfully resets password with valid OTP and strong password', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: testEmail,
          otp: capturedResetOtp,
          newPassword: updatedPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Prevents login with old password and verifies new password works', async () => {
      // Old password fails
      const oldRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: strongPassword });
      expect(oldRes.status).toBe(401);

      // New password succeeds
      const newRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: updatedPassword });
      expect(newRes.status).toBe(200);
      expect(newRes.body.token).toBeDefined();
      sessionToken = newRes.body.token;
    });
  });

  describe('4. Multi-Factor Authentication (MFA / 2FA) Flow', () => {
    it('Enables MFA for the authenticated user', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/toggle')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.mfaEnabled).toBe(true);
    });

    it('Login challenge triggers MFA requirement and issues temp session token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: updatedPassword });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.token).toBeUndefined(); // Full JWT not yet issued!
      expect(res.body.tempToken).toBeDefined();
      expect(res.body.email).toBeDefined();

      userMfaTempToken = res.body.tempToken;

      const recent = emailService.getRecentOtp(testEmail);
      expect(recent).toBeDefined();
      expect(recent.type).toBe('mfa_login');
      expect(recent.otp).toMatch(/^\d{6}$/);
    });

    it('Temp MFA token cannot be used to access protected resources', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userMfaTempToken}`);

      expect(res.status).toBe(401);
    });

    it('Fails verification with invalid 6-digit OTP', async () => {
      const res = await request(app)
        .post('/api/auth/verify-mfa')
        .send({
          tempToken: userMfaTempToken,
          otp: '123456'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    it('Resends MFA OTP on user request', async () => {
      const res = await request(app)
        .post('/api/auth/resend-mfa-otp')
        .send({ tempToken: userMfaTempToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tempToken).toBeDefined();

      userMfaTempToken = res.body.tempToken;
    });

    it('Succeeds with correct MFA OTP and issues full authentication token', async () => {
      const recent = emailService.getRecentOtp(testEmail);
      expect(recent).toBeDefined();
      const validOtp = recent.otp;

      const res = await request(app)
        .post('/api/auth/verify-mfa')
        .send({
          tempToken: userMfaTempToken,
          otp: validOtp
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();

      sessionToken = res.body.token;

      // Verify session token now accesses protected route
      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.user.email.toLowerCase()).toBe(testEmail.toLowerCase());
    });

    it('Disabling MFA allows direct login without OTP challenge', async () => {
      const disableRes = await request(app)
        .post('/api/auth/mfa/toggle')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ enabled: false });

      expect(disableRes.status).toBe(200);
      expect(disableRes.body.mfaEnabled).toBe(false);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: updatedPassword });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.mfaRequired).toBeUndefined();
      expect(loginRes.body.token).toBeDefined();
    });
  });
});
