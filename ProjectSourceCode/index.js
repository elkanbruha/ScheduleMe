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

const initDB = async () => {
  try {
    await db.connect();
    console.log('Database connection successful');

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

app.get('/login', (req, res) => {
    //do something
    res.render('pages/login');
  });

// MODIFIED REGISTER TO INCLUDE NEW PARAMETERS
// Register route
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  
  // Hash the password
  const hash = await bcrypt.hash(password, 10);
  
  // Insert into users table with only the required fields
  db.none('INSERT INTO users(name, email, password) VALUES($1, $2, $3)',
    [name, email, hash])
    .then(() => {
      res.status(200).json({ message: 'Registration successful' });
      res.redirect('/login');
    })
    .catch(error => {
      console.log(error);
      res.status(500).json({ message: 'Database error' });
    });
});

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  const user = await db.oneOrNone(`SELECT * FROM users WHERE email = $1`, [email]);
  
  if (!user) {
    console.log('User not found');
    return res.redirect('/login');
  }
  
  const match = await bcrypt.compare(password, user.password);
  
  if (!match) {
    console.log('Invalid password');
    return res.redirect('/login');
  }
  
  // Save user details in session
  req.session.user = user;
  req.session.save();
  
  // Redirect to calendar page
  res.redirect('/calendar');
});


app.get('/logout', (req, res) => {
    res.render('pages/logout'); 
});

app.get('/calendar', (req, res) => {
    res.render('pages/Calendar'); 
});

// Create a new appointment
app.post('/api/appointments', async (req, res) => {
  const { user_id, business_id, user_password, start_time, end_time, reason } = req.body;
  
  if (!user_id || !business_id || !user_password || !start_time || !end_time) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE user_id = $1', [user_id]);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const passwordMatch = await bcrypt.compare(user_password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    
    const business = await db.oneOrNone('SELECT * FROM businesses WHERE business_id = $1', [business_id]);
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }
    
    // Create the appointment
    await db.none(
      'INSERT INTO appointments(user_id, business_id, start_time, end_time, reason) VALUES($1, $2, $3, $4, $5)',
      [user_id, business_id, start_time, end_time, reason]
    );
    
    res.status(201).json({ message: 'Appointment created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get appointments for a user or business
app.get('/api/appointments', async (req, res) => {
  const { id, password, type } = req.query;
  
  if (!id || !password || !type) {
    return res.status(400).json({ message: 'Missing required parameters. Please provide id, password, and type (user or business)' });
  }
  
  try {
    let entity;
    let appointments;
    
    // Check if user or business
    if (type === 'user') {
      // Verify user exists and password is correct
      entity = await db.oneOrNone('SELECT * FROM users WHERE user_id = $1', [id]);
      if (!entity) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const passwordMatch = await bcrypt.compare(password, entity.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      
      // Get appointments for user
      appointments = await db.manyOrNone(`
        SELECT a.*, b.name as business_name 
        FROM appointments a
        JOIN businesses b ON a.business_id = b.business_id
        WHERE a.user_id = $1
        ORDER BY a.start_time ASC
      `, [id]);
    } else if (type === 'business') {
      entity = await db.oneOrNone('SELECT * FROM businesses WHERE business_id = $1', [id]);
      if (!entity) {
        return res.status(404).json({ message: 'Business not found' });
      }
      
      const passwordMatch = await bcrypt.compare(password, entity.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      
      appointments = await db.manyOrNone(`
        SELECT a.*, u.name as user_name 
        FROM appointments a
        JOIN users u ON a.user_id = u.user_id
        WHERE a.business_id = $1
        ORDER BY a.start_time ASC
      `, [id]);
    } else {
      return res.status(400).json({ message: 'Invalid type. Must be "user" or "business"' });
    }
    
    res.status(200).json({ appointments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


/// End Endpoint Config ///



// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});