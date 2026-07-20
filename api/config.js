module.exports = function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(200).json({
    contentApiUrl: process.env.CONTENT_API_URL || '',
    bookingApiUrl: process.env.BOOKING_API_URL || '',
    environment: process.env.VERCEL_ENV || 'development'
  });
};
