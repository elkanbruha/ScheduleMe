const { writeFileSync } = require('fs');
const { createEvent } = require('ics');

function generateIcsFile(appointment, filePath) {
  return new Promise((resolve, reject) => {
    const event = {
      start: appointment.start, // [YYYY, MM, DD, HH, MM]
      duration: appointment.duration, // { hours: X, minutes: Y }
      title: appointment.title,
      description: appointment.description,
      location: appointment.location,
      uid: `${appointment.id}@yourdomain.com`,
      organizer: {
        name: 'Your App Name',
        email: 'no-reply@yourdomain.com',
      },
    };

    createEvent(event, (error, value) => {
      if (error) {
        reject(error);
      } else {
        writeFileSync(filePath, value);
        resolve(filePath);
      }
    });
  });
}

module.exports = generateIcsFile;
