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
const { writeFile, unlink } = require('fs/promises');
const fs = require('fs');

/// Handlebars config
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
  // Add helpers here
  helpers: {
    // Register the array helper to create arrays in templates
    array: function() {
      return Array.prototype.slice.call(arguments, 0, -1);
    },
    // Register the lower helper to convert strings to lowercase
    lower: function(str) {
      return str.toLowerCase();
    }
    // You can add other custom helpers here as needed
  }
});

// database configuration
const dbConfig = {
  host: process.env.POSTGRES_HOST, 
  port: process.env.POSTGRES_PORT || 5432, 
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: false
};
  
// Create database connection
const db = pgp(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    await db.one('SELECT 1');
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

// Initialize database
const initDB = async () => {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Database connection failed');
    }

    // Check if tables exist, create if they don't
    await db.tx(async t => {
      await t.none(`
        CREATE TABLE IF NOT EXISTS users (
          user_id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL
        )
      `);

      await t.none(`
        CREATE TABLE IF NOT EXISTS businesses (
          business_id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          business_name VARCHAR(255) NOT NULL
        )
      `);

      await t.none(`
        CREATE TABLE IF NOT EXISTS appointments (
          appointment_id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP NOT NULL,
          reason TEXT,
          CHECK (start_time < end_time)
        )
      `);

      // Create indexes
      await t.none('CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id)');
      await t.none('CREATE INDEX IF NOT EXISTS idx_appointments_business ON appointments(business_id)');
      await t.none('CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(start_time)');
    });

    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

// Initialize database
initDB();

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

app.use((req, res, next) => {
  // Store the original render method
  const originalRender = res.render;
  
  // Override the render method
  res.render = function(view, options, callback) {
    // Create options object if it doesn't exist
    options = options || {};
    
    // Add the navbar variables
    options.isLoggedIn = !!req.session.user;
    options.isBusiness = req.session.user && req.session.userType === 'business';
    options.email = req.session.user ? req.session.user.email : '';
    
    // Call the original render method
    originalRender.call(this, view, options, callback);
  };
  
  next();
});

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

app.get('/videocall', (req, res) => {
  res.render('pages/videocall'); 
});

app.get('/login', (req, res) => {
  //do something
  res.render('pages/login');
});

app.get('/about', (req, res) => {
  res.render('pages/about'); 
});

// Register route to handle both user and business registrations
app.post('/register', async (req, res) => {
  const { name, email, password, type, business_name } = req.body;
  
  try {
    // Validate required fields
    if (!name || !email || !password || !type) {
      return res.status(400).render('pages/Register', { 
        error: 'All fields are required' 
      });
    }
    
    // Additional validation for business registration
    if (type === 'business' && !business_name) {
      return res.status(400).render('pages/Register', { 
        error: 'Business name is required for business registration'
      });
    }
    
    // Check if email already exists in appropriate table
    let existingEntity;
    if (type === 'user') {
      existingEntity = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
    } else if (type === 'business') {
      existingEntity = await db.oneOrNone('SELECT * FROM businesses WHERE email = $1', [email]);
    } else {
      return res.status(400).render('pages/Register', { 
        error: 'Invalid account type' 
      });
    }
    
    if (existingEntity) {
      return res.status(400).render('pages/Register', { 
        error: 'Email already registered' 
      });
    } 
    
    // Hash password
    const hash = await bcrypt.hash(password, 10);
    
    // Insert into appropriate table
    if (type === 'user') {
      await db.none('INSERT INTO users(name, email, password) VALUES($1, $2, $3)',
        [name, email, hash]);
    } else if (type === 'business') {
      await db.none('INSERT INTO businesses(name, email, password, business_name) VALUES($1, $2, $3, $4)',
        [name, email, hash, business_name]);
    }
    
    // Redirect to login page
    return res.redirect('/login');
    
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).render('pages/Register', { 
      error: 'Registration failed. Please try again.' 
    });
  }
});

app.post('/login', async (req, res) => {
  const { email, password, type } = req.body;
  
  if (!email || !password || !type) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  
  try {
    let entity;
    
    if (type === 'user') {
      entity = await db.oneOrNone(`SELECT * FROM users WHERE email = $1`, [email]);
    } else if (type === 'business') {
      entity = await db.oneOrNone(`SELECT * FROM businesses WHERE email = $1`, [email]);
    } else {
      return res.status(400).json({ message: 'Invalid type. Must be "user" or "business"' });
    }
    
    if (!entity) {
      console.log('Entity not found');
      return res.redirect('/login');
    }
    
    const match = await bcrypt.compare(password, entity.password);
    
    if (!match) {
      console.log('Invalid password');
      return res.redirect('/login');
    }
    
    // Save entity details and type in session
    req.session.user = entity;
    req.session.userType = type;
    req.session.save();
     
    // Redirect to calendar page
    res.redirect('/calendar');
  } catch (error) {
    console.error(error); 
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/logout', (req, res) => {
  // Destroy the session
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error logging out');
    }
    
    // Redirect to home page after logout
    res.redirect('/');
  });
});

app.get('/calendar', (req, res) => {
  res.render('pages/Calendar'); 
});

app.get('/help', (req, res) => {
  res.render('pages/help'); 
});

app.post('/appointments', async (req, res) => {
  // Check if user is logged in
  if (!req.session.user || !req.session.userType) {
    return res.status(401).json({ message: 'You need to be logged in to create appointments' });
  }
  
  const { business_id, start_time, end_time, reason } = req.body;
  let user_id;
  
  if (req.session.userType === 'user') {
    // User creating appointment
    if (!business_id || !start_time || !end_time) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    user_id = req.session.user.user_id;
    
    try {
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
  } else {
    // Business can't create appointments
    return res.status(403).json({ message: 'Only users can create appointments' });
  }
});

app.get('/appointments', async (req, res) => {
  // Check if user is logged in
  if (!req.session.user || !req.session.userType) {
    return res.status(401).json({ message: 'You need to be logged in to view appointments' });
  }
  
  console.log('Session data in /appointments:', {
    userType: req.session.userType,
    userId: req.session.user.user_id,
    user: req.session.user
  });
  
  try {
    let appointments;
    
    // Check if user or business
    if (req.session.userType === 'user') {
      const userId = req.session.user.user_id;
      console.log('Fetching appointments for user:', userId);
      
      // Get appointments for user
      appointments = await db.manyOrNone(`
        SELECT a.*, b.name as business_name, b.business_name as business_display_name
        FROM appointments a
        JOIN businesses b ON a.business_id = b.business_id
        WHERE a.user_id = $1
        ORDER BY a.start_time ASC
      `, [userId]);
      
      console.log('Found appointments:', appointments);
    } else if (req.session.userType === 'business') {
      const businessId = req.session.user.business_id;
      
      appointments = await db.manyOrNone(`
        SELECT a.*, u.name as user_name 
        FROM appointments a
        JOIN users u ON a.user_id = u.user_id
        WHERE a.business_id = $1
        ORDER BY a.start_time ASC
      `, [businessId]);
    }
    
    res.status(200).json({ appointments });
  } catch (error) {
    console.error('Error in /appointments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all businesses
app.get('/businesses', async (req, res) => {
  try {
    const businesses = await db.manyOrNone(`
      SELECT business_id, name, business_name
      FROM businesses
      ORDER BY name ASC
    `);
    
    res.status(200).json({ businesses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get a single appointment by ID
app.get('/appointments/:id', async (req, res) => {
  // Check if user is logged in
  if (!req.session.user || !req.session.userType) {
    return res.status(401).json({ message: 'You need to be logged in to view appointments' });
  }
  
  const appointmentId = req.params.id;
  
  try {
    let appointment;
    
    // Check if user or business, then fetch appropriate appointment with joins
    if (req.session.userType === 'user') {
      appointment = await db.oneOrNone(`
        SELECT a.*, b.name as business_name, b.business_name as business_display_name
        FROM appointments a
        JOIN businesses b ON a.business_id = b.business_id
        WHERE a.appointment_id = $1 AND a.user_id = $2
      `, [appointmentId, req.session.user.user_id]);
    } else if (req.session.userType === 'business') {
      appointment = await db.oneOrNone(`
        SELECT a.*, u.name as user_name 
        FROM appointments a
        JOIN users u ON a.user_id = u.user_id
        WHERE a.appointment_id = $1 AND a.business_id = $2
      `, [appointmentId, req.session.user.business_id]);
    }
    
    if (!appointment) {
      return res.status(404).json({ 
        message: 'Appointment not found or you do not have permission to view it' 
      });
    }
    
    res.status(200).json({ appointment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update an appointment
app.put('/appointments/:id', async (req, res) => {
  // Check if user is logged in
  if (!req.session.user || !req.session.userType) {
    return res.status(401).json({ message: 'You need to be logged in to update appointments' });
  }
  
  const appointmentId = req.params.id;
  const { start_time, end_time, reason } = req.body;
  
  // Validate required fields
  if (!start_time || !end_time) {
    return res.status(400).json({ message: 'Start time and end time are required' });
  }
  
  try {
    // First, check if the appointment exists and belongs to this user/business
    let appointment;
    
    if (req.session.userType === 'user') {
      appointment = await db.oneOrNone(`
        SELECT * FROM appointments 
        WHERE appointment_id = $1 AND user_id = $2
      `, [appointmentId, req.session.user.user_id]);
    } else if (req.session.userType === 'business') {
      appointment = await db.oneOrNone(`
        SELECT * FROM appointments 
        WHERE appointment_id = $1 AND business_id = $2
      `, [appointmentId, req.session.user.business_id]);
    }
    
    if (!appointment) {
      return res.status(404).json({ 
        message: 'Appointment not found or you do not have permission to update it' 
      });
    }
    
    // Update the appointment
    await db.none(`
      UPDATE appointments 
      SET start_time = $1, end_time = $2, reason = $3
      WHERE appointment_id = $4
    `, [start_time, end_time, reason, appointmentId]);
    
    return res.status(200).json({ message: 'Appointment updated successfully' });
    
  } catch (error) {
    console.error('Error updating appointment:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete an appointment
app.delete('/appointments/:id', async (req, res) => {
  // Check if user is logged in
  if (!req.session.user || !req.session.userType) {
    return res.status(401).json({ message: 'You need to be logged in to delete appointments' });
  }
  
  const appointmentId = req.params.id;
  
  try {
    // First, check if the appointment exists and belongs to this user/business
    let appointment;
    
    if (req.session.userType === 'user') {
      appointment = await db.oneOrNone(`
        SELECT * FROM appointments 
        WHERE appointment_id = $1 AND user_id = $2
      `, [appointmentId, req.session.user.user_id]);
    } else if (req.session.userType === 'business') {
      appointment = await db.oneOrNone(`
        SELECT * FROM appointments 
        WHERE appointment_id = $1 AND business_id = $2
      `, [appointmentId, req.session.user.business_id]);
    }
    
    if (!appointment) {
      return res.status(404).json({ 
        message: 'Appointment not found or you do not have permission to delete it' 
      });
    }
    
    // Delete the appointment
    await db.none('DELETE FROM appointments WHERE appointment_id = $1', [appointmentId]);
    
    return res.status(200).json({ message: 'Appointment deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Function to get appointment for iCalendar export
async function getAppointmentFromDatabase(appointmentId, req) {
  try {
    // Debug logging
    console.log('Session data:', {
      userType: req.session.userType,
      user: req.session.user,
      appointmentId: appointmentId
    });

    // First check if the user is logged in
    if (!req.session.user || !req.session.userType) {
      console.log('No session data found');
      return null;
    }

    // First try to get the appointment without user/business check
    let appointment = await db.oneOrNone(`
      SELECT a.*, b.name as business_name, b.business_name as business_display_name, u.name as user_name
      FROM appointments a
      LEFT JOIN businesses b ON a.business_id = b.business_id
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE a.appointment_id = $1
    `, [appointmentId]);

    console.log('Raw appointment data:', appointment);

    if (!appointment) {
      console.log('Appointment not found in database');
      return null;
    }

    // Verify ownership
    if (req.session.userType === 'user' && appointment.user_id !== req.session.user.user_id) {
      console.log('User does not own this appointment');
      return null;
    }

    if (req.session.userType === 'business' && appointment.business_id !== req.session.user.business_id) {
      console.log('Business does not own this appointment');
      return null;
    }

    console.log('Appointment found and verified:', appointment);
    return appointment;
  } catch (error) {
    console.error('Error in getAppointmentFromDatabase:', error);
    return null;
  }
}

// Helper functions for iCalendar
function dateToIcsArray(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) throw new Error('Invalid date format');
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
}

function generateIcsFile(appointment, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Create basic ICS content without using ics library
      const startDate = new Date(appointment.start_time);
      const endDate = new Date(appointment.end_time);
      
      const formatIcsDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d+/g, '').slice(0, 15) + 'Z';
      };
      
      const startDateStr = formatIcsDate(startDate);
      const endDateStr = formatIcsDate(endDate);
      const now = formatIcsDate(new Date());
      
      const withPerson = appointment.user_name || appointment.business_name || 'Unknown';
      
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ScheduleMe//NONSGML Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${appointment.appointment_id}@scheduleme.com
DTSTAMP:${now}
DTSTART:${startDateStr}
DTEND:${endDateStr}
SUMMARY:${appointment.reason || 'Appointment'}
DESCRIPTION:${appointment.reason || 'No description provided.'}\\nWith: ${withPerson}
LOCATION:Online or TBD
END:VEVENT
END:VCALENDAR`;
      
      // Write the ICS file
      fs.writeFileSync(filePath, icsContent);
      resolve(filePath);
    } catch (err) {
      reject(err);
    }
  });
}

// Download ICS file for an appointment
app.get('/download-ics/:appointmentId', async (req, res) => {
  const appointmentId = req.params.appointmentId;
  
  console.log('Download ICS request:', {
    appointmentId,
    session: {
      userType: req.session.userType,
      userId: req.session.user?.user_id,
      businessId: req.session.user?.business_id
    }
  });

  // Get the appointment data
  const appointment = await getAppointmentFromDatabase(appointmentId, req);

  if (!appointment) {
    console.log('Appointment not found or not accessible:', {
      appointmentId,
      session: {
        userType: req.session.userType,
        userId: req.session.user?.user_id,
        businessId: req.session.user?.business_id
      }
    });
    return res.status(404).send('Appointment not found');
  }

  console.log('Found appointment for download:', appointment);

  // Create directory if it doesn't exist
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, `appointment-${appointmentId}.ics`);
  
  try {
    await generateIcsFile(appointment, filePath);
    console.log('ICS file generated successfully:', filePath);
    
    res.download(filePath, `appointment-${appointmentId}.ics`, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).send('Error downloading file');
      } else {
        // Delete file after download
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
            console.log('Temporary file deleted:', filePath);
          } catch (e) {
            console.error('Error deleting file:', e);
          }
        }, 1000);
      }
    });
  } catch (err) {
    console.error('Error generating ICS file:', err);
    res.status(500).send('Failed to generate ICS file');
  }
});

/// End Endpoint Config ///

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});