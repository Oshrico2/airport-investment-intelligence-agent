// Vercel Function for every /api/* request (vercel.json rewrites them here): the NestJS app compiled by `npm run build`.
module.exports = require('../server/dist/serverless.js').default;
