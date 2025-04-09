// Initialize server
const server = require('../index');
// Import Libraries
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// Register API Tests
describe('Testing Register API', () => {
  it('Positive: should register a new user', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Test User',
        email: 'testuser_' + Date.now() + '@example.com',
        password: 'securePassword123'
      })
      .end((_, res) => {
        res.should.have.status(200);
        res.body.should.have.property('message').equal('Registration successful');
        done();
      });
  });

  it('Negative: should return 400 when required fields are missing', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        email: 'incomplete_' + Date.now() + '@example.com',
        password: 'securePassword123'
      })
      .end((err, res) => {
        res.should.have.status(400);
        res.body.should.have.property('message').equal('Missing required fields');
        done();
      });
  });
  
  it('Negative: should return 500 when email already exists', done => {
    const duplicateEmail = 'duplicate_' + Date.now() + '@example.com';
    
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'First User',
        email: duplicateEmail,
        password: 'securePassword123'
      })
      .end((err, res) => {
        res.should.have.status(200);
        
        chai
          .request(server)
          .post('/register')
          .type('form')
          .send({
            name: 'Second User',
            email: duplicateEmail,
            password: 'anotherPassword123'
          })
          .end((err, res) => {
            res.should.have.status(500);
            res.body.should.have.property('message').equal('Database error');
            done();
          });
      });
  });
});

// Login API Tests
describe('Testing Login API', () => {
  const testEmail = 'logintest_' + Date.now() + '@example.com';
  const testPassword = 'loginPassword123';
  
  before(done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Login Test User',
        email: testEmail,
        password: testPassword
      })
      .end((err, res) => {
        res.should.have.status(200);
        done();
      });
  });
  
  it('Positive: should login successfully with correct credentials', done => {
    chai
      .request(server)
      .post('/login')
      .type('form')
      .send({
        email: testEmail,
        password: testPassword
      })
      .end((err, res) => {
        res.redirects.should.be.an('array').that.is.not.empty;
        res.redirects[0].should.match(/\/calendar$/);
        done();
      });
  });
  
  it('Negative: should fail login with incorrect password', done => {
    chai
      .request(server)
      .post('/login')
      .type('form')
      .send({
        email: testEmail,
        password: 'wrongPassword'
      })
      .end((err, res) => {
        res.redirects.should.be.an('array').that.is.not.empty;
        res.redirects[0].should.match(/\/login$/);
        done();
      });
  });
});

// Appointments API Tests
describe('Testing Appointments API', () => {
  // Test data
  let userId, businessId;
  const testPassword = 'appointmentTest123';
  const userEmail = 'user_' + Date.now() + '@example.com';
  const businessEmail = 'business_' + Date.now() + '@example.com';
  
  // Create test user and business
  before(async function() {
    this.timeout(10000);
    
    // Create test user
    const userRes = await chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Test User',
        email: userEmail,
        password: testPassword
      });
    
    userId = userRes.body.userId || 1; // Use returned ID or fallback
    
    // Create test business (assume you have an endpoint for this)
    const businessRes = await chai
      .request(server)
      .post('/businesses')
      .type('form')
      .send({
        name: 'Test Business',
        email: businessEmail,
        password: testPassword,
        business_name: 'Test Business Name'
      });
    
    businessId = businessRes.body.businessId || 1; // Use returned ID or fallback
  });
  
  it('Positive: should create a new appointment', done => {
    const startTime = new Date(Date.now() + 86400000); // Tomorrow
    const endTime = new Date(startTime.getTime() + 3600000); // 1 hour later
    
    chai
      .request(server)
      .post('/api/appointments')
      .type('json')
      .send({
        user_id: userId,
        business_id: businessId,
        user_password: testPassword,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        reason: 'Test appointment'
      })
      .end((err, res) => {
        res.should.have.status(201);
        res.body.should.have.property('message').equal('Appointment created successfully');
        done();
      });
  });
  
  it('Negative: should fail to create appointment with invalid credentials', done => {
    const startTime = new Date(Date.now() + 86400000); // Tomorrow
    const endTime = new Date(startTime.getTime() + 3600000); // 1 hour later
    
    chai
      .request(server)
      .post('/api/appointments')
      .type('json')
      .send({
        user_id: userId,
        business_id: businessId,
        user_password: 'wrongPassword',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        reason: 'Test appointment'
      })
      .end((err, res) => {
        res.should.have.status(401);
        res.body.should.have.property('message').equal('Invalid password');
        done();
      });
  });
  
  it('Positive: should get user appointments', done => {
    chai
      .request(server)
      .get('/api/appointments')
      .query({
        id: userId,
        password: testPassword,
        type: 'user'
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.body.should.have.property('appointments').that.is.an('array');
        done();
      });
  });
  
  it('Positive: should get business appointments', done => {
    chai
      .request(server)
      .get('/api/appointments')
      .query({
        id: businessId,
        password: testPassword,
        type: 'business'
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.body.should.have.property('appointments').that.is.an('array');
        done();
      });
  });
  
  it('Negative: should fail to get appointments with invalid type', done => {
    chai
      .request(server)
      .get('/api/appointments')
      .query({
        id: userId,
        password: testPassword,
        type: 'invalid'
      })
      .end((err, res) => {
        res.should.have.status(400);
        res.body.should.have.property('message').equal('Invalid type. Must be "user" or "business"');
        done();
      });
  });
});