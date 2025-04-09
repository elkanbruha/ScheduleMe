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
  it('Positive: should register a new user and redirect to login', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Test User',
        email: 'testuser_' + Date.now() + '@example.com',
        password: 'securePassword123',
        user_type: 'customer'
      })
      .end((_, res) => {
        res.should.have.status(200);
        res.body.should.have.property('message').equal('Success');
        res.redirects.should.be.an('array').that.is.not.empty;
        res.redirects[0].should.match(/\/login$/);
        done();
      });
  });

  it('Positive: should register a provider user', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Test Provider',
        email: 'provider_' + Date.now() + '@example.com',
        password: 'securePassword123',
        user_type: 'provider'
      })
      .end((_, res) => {
        res.should.have.status(200);
        res.body.should.have.property('message').equal('Success');
        done();
      });
  });

  it('Positive: should register an admin user', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Test Admin',
        email: 'admin_' + Date.now() + '@example.com',
        password: 'securePassword123',
        user_type: 'admin'
      })
      .end((_, res) => {
        res.should.have.status(200);
        res.body.should.have.property('message').equal('Success');
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
        password: 'securePassword123',
        user_type: 'customer'
      })
      .end((err, res) => {
        res.should.have.status(400);
        res.body.should.have.property('message').equal('Missing required fields');
        done();
      });
  });

  it('Negative: should return 400 when user_type is invalid', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        name: 'Invalid Type User',
        email: 'invalid_' + Date.now() + '@example.com',
        password: 'securePassword123',
        user_type: 'invalid_type'
      })
      .end((err, res) => {
        res.should.have.status(400);
        res.body.should.have.property('message');
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
        password: 'securePassword123',
        user_type: 'customer'
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
            password: 'anotherPassword123',
            user_type: 'customer'
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
        password: testPassword,
        user_type: 'customer'
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
        res.should.have.status(200);
        res.redirects.should.be.an('array').that.is.not.empty;
        res.redirects[0].should.match(/\/home$/);
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
  
  it('Negative: should fail login with non-existent email', done => {
    chai
      .request(server)
      .post('/login')
      .type('form')
      .send({
        email: 'nonexistent_' + Date.now() + '@example.com',
        password: testPassword
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
  const customerAgent = chai.request.agent(server);
  const providerAgent = chai.request.agent(server);
  
  const customerEmail = 'appt_customer_' + Date.now() + '@example.com';
  const providerEmail = 'appt_provider_' + Date.now() + '@example.com';
  const password = 'appointmentTest123';
  
  before(async function() {
    this.timeout(10000);
    
    await new Promise(resolve => {
      chai
        .request(server)
        .post('/register')
        .type('form')
        .send({
          name: 'Appointment Customer',
          email: customerEmail,
          password: password,
          user_type: 'customer'
        })
        .end((err, res) => {
          res.should.have.status(200);
          resolve();
        });
    });
    
    await new Promise(resolve => {
      chai
        .request(server)
        .post('/register')
        .type('form')
        .send({
          name: 'Appointment Provider',
          email: providerEmail,
          password: password,
          user_type: 'provider'
        })
        .end((err, res) => {
          res.should.have.status(200);
          resolve();
        });
    });
    
    await new Promise(resolve => {
      customerAgent
        .post('/login')
        .type('form')
        .send({
          email: customerEmail,
          password: password
        })
        .end((err, res) => {
          resolve();
        });
    });
    
    await new Promise(resolve => {
      providerAgent
        .post('/login')
        .type('form')
        .send({
          email: providerEmail,
          password: password
        })
        .end((err, res) => {
          resolve();
        });
    });
  });
  
  it('Positive: customer should be able to book an appointment', done => {
    customerAgent
      .post('/appointments')
      .type('form')
      .send({
        provider_id: 1,
        service_id: 1,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Test appointment booking'
      })
      .end((err, res) => {
        res.should.have.status(201);
        res.body.should.have.property('message').equal('Appointment booked successfully');
        res.body.should.have.property('start_time');
        res.body.should.have.property('end_time');
        done();
      });
  });
  
  it('Negative: should not allow booking without login', done => {
    chai
      .request(server)
      .post('/appointments')
      .type('form')
      .send({
        provider_id: 1,
        service_id: 1,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        notes: 'This should fail'
      })
      .end((err, res) => {
        res.should.have.status(401);
        res.body.should.have.property('message').equal('Please log in to book an appointment');
        done();
      });
  });
  
  it('Negative: provider should not be able to book an appointment', done => {
    providerAgent
      .post('/appointments')
      .type('form')
      .send({
        provider_id: 1,
        service_id: 1,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        notes: 'This should fail'
      })
      .end((err, res) => {
        res.should.have.status(403);
        res.body.should.have.property('message').equal('Only customers can book appointments');
        done();
      });
  });
  
  it('Negative: should fail when booking outside provider availability', done => {
    const sunday = new Date();
    sunday.setDate(sunday.getDate() + (0 - sunday.getDay() + 7) % 7);
    sunday.setHours(10, 0, 0, 0);
    
    customerAgent
      .post('/appointments')
      .type('form')
      .send({
        provider_id: 1,
        service_id: 1,
        start_time: sunday.toISOString(),
        notes: 'This should fail - Sunday booking'
      })
      .end((err, res) => {
        res.should.have.status(400);
        res.body.should.have.property('message').equal('Provider is not available on this day');
        done();
      });
  });
  
  it('Positive: should get customer appointments', done => {
    customerAgent
      .get('/appointments')
      .end((err, res) => {
        res.should.have.status(200);
        done();
      });
  });
  
  it('Positive: should get provider appointments', done => {
    providerAgent
      .get('/appointments')
      .end((err, res) => {
        res.should.have.status(200);
        done();
      });
  });
  
  after(() => {
    customerAgent.close();
    providerAgent.close();
  });
});

// Update Appointment Status Tests
describe('Testing Update Appointment Status API', () => {
  const customerAgent = chai.request.agent(server);
  const providerAgent = chai.request.agent(server);
  let appointmentId;
  
  before(async function() {
    this.timeout(15000);
    
    const customerEmail = 'status_customer_' + Date.now() + '@example.com';
    const providerEmail = 'status_provider_' + Date.now() + '@example.com';
    const password = 'statusTest123';
    
    await new Promise(resolve => {
      chai
        .request(server)
        .post('/register')
        .type('form')
        .send({
          name: 'Status Test Customer',
          email: customerEmail,
          password: password,
          user_type: 'customer'
        })
        .end(resolve);
    });
    
    await new Promise(resolve => {
      chai
        .request(server)
        .post('/register')
        .type('form')
        .send({
          name: 'Status Test Provider',
          email: providerEmail,
          password: password,
          user_type: 'provider'
        })
        .end(resolve);
    });
    
    await new Promise(resolve => {
      customerAgent
        .post('/login')
        .type('form')
        .send({
          email: customerEmail,
          password: password
        })
        .end(resolve);
    });
    
    await new Promise(resolve => {
      providerAgent
        .post('/login')
        .type('form')
        .send({
          email: providerEmail,
          password: password
        })
        .end(resolve);
    });
    
    await new Promise(resolve => {
      customerAgent
        .post('/appointments')
        .type('form')
        .send({
          provider_id: 1,
          service_id: 1,
          start_time: new Date(Date.now() + 172800000).toISOString(),
          notes: 'Test appointment for status update'
        })
        .end((err, res) => {
          if (res.body && res.body.appointmentId) {
            appointmentId = res.body.appointmentId;
          } else {
            appointmentId = 1;
          }
          resolve();
        });
    });
  });
  
  it('Positive: provider should be able to confirm an appointment', done => {
    providerAgent
      .put(`/appointments/${appointmentId}/status`)
      .type('form')
      .send({
        status: 'confirmed'
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.body.should.have.property('message').equal('Appointment status updated successfully');
        done();
      });
  });
  
  it('Positive: customer should be able to cancel their appointment', done => {
    customerAgent
      .put(`/appointments/${appointmentId}/status`)
      .type('form')
      .send({
        status: 'cancelled'
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.body.should.have.property('message').equal('Appointment status updated successfully');
        done();
      });
  });
  
  it('Negative: should reject invalid status values', done => {
    providerAgent
      .put(`/appointments/${appointmentId}/status`)
      .type('form')
      .send({
        status: 'invalid_status'
      })
      .end((err, res) => {
        res.should.have.status(400);
        res.body.should.have.property('message').equal('Invalid status');
        done();
      });
  });
  
  it('Negative: unauthorized user should not update appointment status', done => {
    chai
      .request(server)
      .put(`/appointments/${appointmentId}/status`)
      .type('form')
      .send({
        status: 'confirmed'
      })
      .end((err, res) => {
        res.should.have.status(401);
        res.body.should.have.property('message').equal('Please log in');
        done();
      });
  });
  
  after(() => {
    customerAgent.close();
    providerAgent.close();
  });
});