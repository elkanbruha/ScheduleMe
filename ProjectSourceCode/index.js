// Import dependencies
const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server.





/// Handlebars config
const hbs = handlebars.create({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials',
  });


// database configuration
const dbConfig = {
    host: 'db', // the database server
    port: 5432, // the database port
    database: process.env.POSTGRES_DB, // the database name
    user: process.env.POSTGRES_USER, // the user account to connect with
    password: process.env.POSTGRES_PASSWORD, // the password of the user account
  };
  
  const db = pgp(dbConfig);
  
  // test your database
  db.connect()
    .then(obj => {
      console.log('Database connection successful'); // you can view this message in the docker compose logs
      obj.done(); // success, release the connection;
    })
    .catch(error => {
      console.log('ERROR:', error.message || error);
    });



// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.
app.use(express.static(path.join(__dirname, 'views')));






/// Endpoint Config ///

// home
app.get('/', (req, res) => {
    res.render('pages/home');
    // render home page when complete
});

app.get('/register', (req, res) => {
    res.render('pages/Register'); 
});

// app.get('/login', (req, res) => {
//     res.render('pages/login'); 
// });
app.get('/login', (req, res) => {
    //do something
    res.render('pages/login');
  });

app.post('/login', async (req, res) => {
    // To-DO: Query the 'users' table to find the user with the username from the request
    const user = await db.oneOrNone(`SELECT * FROM Users WHERE user_id = $1`, [req.body.User_id]);
    // check if password from request matches with password in DB
    console.log(user);
    if (!user) {
      console.log('not found');
      res.redirect('/login');
    }
    else {
      const match = await bcrypt.compare(req.body.password, user.password);
      if (!match) {

        res.redirect('/login');
        console.log('Invalid username or password');

      } 
      else {
        //save user details in session like in lab 7
        req.session.user = user;
        req.session.save();
        res.redirect('/home');
      }}
  });




app.get('/logout', (req, res) => {
    res.render('pages/logout'); 
});

app.get('/calendar', (req, res) => {
    res.render('pages/Calendar'); 
});

app.get('/appointments', (req, res) => {
    res.render('pages/appointments'); 
});





/// End Endpoint Config ///



// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});