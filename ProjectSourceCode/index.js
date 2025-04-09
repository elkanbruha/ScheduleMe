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
require('dotenv').config();

// Database Config
const dbConfig = {
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};

const db = pgp(dbConfig);

// 初始化数据库
const initDB = async () => {
  try {
    await db.connect();
    console.log('Database connection successful');

    // 创建所有表
    await db.none(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('customer', 'provider', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS businesses (
        business_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        address VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(255),
        website VARCHAR(255),
        owner_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS services (
        service_id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration INTEGER NOT NULL,
        price DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS providers (
        provider_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        business_id INTEGER NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
        title VARCHAR(100),
        bio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, business_id)
      );

      CREATE TABLE IF NOT EXISTS provider_services (
        provider_service_id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
        UNIQUE(provider_id, service_id)
      );

      CREATE TABLE IF NOT EXISTS availability (
        availability_id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        CHECK (start_time < end_time)
      );

      CREATE TABLE IF NOT EXISTS appointments (
        appointment_id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        provider_id INTEGER NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (start_time < end_time),
        CHECK (customer_id != (SELECT user_id FROM providers WHERE provider_id = appointments.provider_id))
      );
    `);

    // 创建索引
    await db.none(`
      CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(start_time);
      CREATE INDEX IF NOT EXISTS idx_providers_business ON providers(business_id);
      CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id);
    `);

    console.log('Tables and indexes created');


    console.log('Initial data inserted (if needed)');
  } catch (error) {
    console.error('DB initialization failed:', error.message || error);
    process.exit(1); 
  }
};

module.exports = { db, initDB };



// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.
app.use(express.static(path.join(__dirname, 'views')));

// initialize session variables
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);


/// Endpoint Config ///

// home
app.get('/', (req, res) => {
    res.render('pages/home', {}, (err, html) => {
        if (err) {
            res.status(500).send('Error rendering page');
        } else {
            res.send(html + '\n\nSuccess');
        }
    });
});

app.get('/register', (req, res) => {
    res.render('pages/Register'); 
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Invalid input' });
    }
    //hash the password using bcrypt library
    const hash = await bcrypt.hash(req.body.password, 10);

    // To-DO: Insert username and hashed password into the 'users' table
    db.none('INSERT INTO Users(username, password) VALUES($1, $2)', [req.body.username, hash])
      .then(() => {
        res.status(200).json({ message: 'Success' });
        res.redirect('/login');
      })
      .catch(error => {
        console.log(error);
        res.status(500).json({ message: 'Database error' });
        res.redirect('/register');
      }); 
  });


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