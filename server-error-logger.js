const fs = require('fs');
const path = require('path');

const logError = (error) => {
    const logFilePath = path.join(process.cwd(), 'server-error.log');
    fs.appendFileSync(logFilePath, new Date().toISOString() + ' ' + error + '\n');
};

module.exports = { logError };