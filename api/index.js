// Vercel Serverless entry for Express app
// Exports the Express app as the handler so Vercel can route /api/* requests
const app = require('../server');

module.exports = app;
