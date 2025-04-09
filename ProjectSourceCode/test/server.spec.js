// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// ********************** DEFAULT WELCOME TESTCASE ****************************

// describe('Server!', () => {
//   // Sample test case given to test / endpoint.
//   it('Returns the default welcome message', done => {
//     chai
//       .request(server)
//       .get('/')
//       .end((err, res) => {
//         expect(res).to.have.status(200);
//         expect(res.body.status).to.equals('success');
//         assert.strictEqual(res.body.message, 'Welcome!');
//         done();
//       });
//   });
// });

describe('Testing Register API', () => {
  it('Positive: should register a new user and redirect to login', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        username: 'testuser_' + Date.now(),
        password: 'securePassword123'
      })
      .end((_, res) => {
        res.should.have.status(200);
        // Expecting a redirect to /login
        res.redirects.should.be.an('array').that.is.not.empty;
        res.redirects[0].should.match(/\/login$/);
        done();
      });
  });


  it('Negative: should return 400 when username is missing', done => {
    chai
      .request(server)
      .post('/register')
      .type('form')
      .send({
        username: '', // invalid
        password: 'securePassword123'
      })
      .end((err, res) => {
        res.should.have.status(400);
        expect(res.body.message).to.equal('Invalid input');
        done();
      });
  });
});




// *********************** TODO: WRITE 2 UNIT TESTCASES **************************

// ********************************************************************************