CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL, 
  user_type VARCHAR(50) NOT NULL,
);

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  title VARCHAR(200),
  description TEXT,
  CONSTRAINT fk_user
    FOREIGN KEY(user_id) 
    REFERENCES users(user_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id SERIAL PRIMARY KEY,
  schedule_id INT NOT NULL,
  customer_id INT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_schedule
    FOREIGN KEY(schedule_id)
    REFERENCES schedules(schedule_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_customer
    FOREIGN KEY(customer_id)
    REFERENCES users(user_id)
    ON DELETE CASCADE
);


