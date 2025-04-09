-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('customer', 'provider', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Businesses table
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

-- Services table
CREATE TABLE IF NOT EXISTS services (
  service_id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL, -- in minutes
  price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
  provider_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
  title VARCHAR(100),
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, business_id) -- A provider can only be linked once to each business
);

-- Provider services
CREATE TABLE IF NOT EXISTS provider_services (
  provider_service_id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
  UNIQUE(provider_id, service_id) -- A provider can only offer each service once
);

-- Availability
CREATE TABLE IF NOT EXISTS availability (
  availability_id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 is Sunday, 6 is Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time) -- Start time must be before end time
);

-- Appointments table
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
  CHECK (start_time < end_time), -- Start time must be before end time
  CHECK (customer_id != (SELECT user_id FROM providers WHERE provider_id = provider_id)) -- Customer cannot book themselves
);

-- Create indexes for common queries
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_provider ON appointments(provider_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_date ON appointments(start_time);
CREATE INDEX idx_providers_business ON providers(business_id);
CREATE INDEX idx_services_business ON services(business_id);

-- Insert sample data

INSERT INTO users (name, email, password, user_type) VALUES
('Admin User', 'admin@example.com', '$2a$10$rRN.1gHfHcZtNlPbpgEYJ.DXAkJD0F8kqt/cE3XmcyQNkFZ7LKKbK', 'admin'),
('Provider User', 'provider@example.com', '$2a$10$rRN.1gHfHcZtNlPbpgEYJ.DXAkJD0F8kqt/cE3XmcyQNkFZ7LKKbK', 'provider'),
('Customer User', 'customer@example.com', '$2a$10$rRN.1gHfHcZtNlPbpgEYJ.DXAkJD0F8kqt/cE3XmcyQNkFZ7LKKbK', 'customer');

INSERT INTO businesses (name, description, address, phone, email, website, owner_id) VALUES
('Example Business', 'A sample business for testing', '123 Main St, Anytown, USA', '555-123-4567', 'contact@example.com', 'https://example.com', 2);

INSERT INTO services (business_id, name, description, duration, price) VALUES
(1, 'Consultation', 'Initial consultation session', 60, 100.00),
(1, 'Follow-up', 'Follow-up session', 30, 50.00);

INSERT INTO providers (user_id, business_id, title, bio) VALUES
(2, 1, 'Senior Consultant', 'Experienced consultant with 10+ years in the field');

INSERT INTO provider_services (provider_id, service_id) VALUES
(1, 1),
(1, 2);

INSERT INTO availability (provider_id, day_of_week, start_time, end_time) VALUES
(1, 1, '09:00:00', '17:00:00'), -- Monday
(1, 2, '09:00:00', '17:00:00'), -- Tuesday
(1, 3, '09:00:00', '17:00:00'), -- Wednesday
(1, 4, '09:00:00', '17:00:00'), -- Thursday
(1, 5, '09:00:00', '17:00:00'); -- Friday

INSERT INTO appointments (customer_id, provider_id, service_id, start_time, end_time, status, notes) VALUES
(3, 1, 1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 'confirmed', 'Initial consultation to discuss services.');