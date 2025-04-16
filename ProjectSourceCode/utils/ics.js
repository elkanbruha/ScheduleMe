const { writeFileSync } = require('fs');
const { createEvent } = require('ics');

/**
 * Convert a JavaScript Date to [YYYY, MM, DD, HH, MM]
 * Note: Month is 1-indexed for ICS, but 0-indexed in JS.
 */
function dateToIcsArray(date) {
  const d = new Date(date);
  return [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes()
  ];
}

function generateIcsFile(appointment, filePath) {
  return new Promise((resolve, reject) => {
    const event = {
      start: dateToIcsArray(appointment.start_time),
      end: dateToIcsArray(appointment.end_time),
      title: appointment.reason || 'Appointment',
      description: appointment.description || '',
      location: appointment.location || '',
      uid: `${appointment.appointment_id}@yourdomain.com`,
      organizer: {
        name: 'Your App Name'
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
