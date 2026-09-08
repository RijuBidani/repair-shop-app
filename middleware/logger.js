const { format } = require('date-fns')
const { v4: uuid } = require('uuid')
const fs = require('fs')
const fsPromises = require('fs').promises
const path = require('path')

const logEvents = async (message, logFileName) => {
    const dateTime = `${format(new Date(), 'yyyyMMdd\tHH:mm:ss')}`
    const logItem = `${dateTime}\t${uuid()}\t${message}\n`

    try {
        if (!fs.existsSync(path.join(__dirname, '..', 'logs'))) {
            await fsPromises.mkdir(path.join(__dirname, '..', 'logs'))
        }
        await fsPromises.appendFile(path.join(__dirname, '..', 
        'logs', logFileName), logItem)
    } catch (err) {
        console.log(err)
    }
}

const logger = (req, res, next) => {
    const ignoredPaths = [
        '/favicon.ico',
        '/css/',
        '/js/',
        '/images/'
    ];

    const isStaticRequest = ignoredPaths.some(path =>
        req.path.startsWith(path)
    );

    const isApiRequest =
        req.path === '/users' ||
        req.path.startsWith('/users/') ||
        req.path === '/notes' ||
        req.path.startsWith('/notes/')
    const changesServerState =
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    // Skip static assets; log API traffic and state-changing requests.
    if (!isStaticRequest && (isApiRequest || changesServerState)) {
        const origin = req.headers.origin ?? 'no-origin';

        logEvents(
            `${req.method}\t${req.originalUrl}\t${origin}`,
            'reqLog.log'
        );
    }

    console.log(`${req.method} ${req.path}`);
    next();
};

module.exports = { logEvents, logger }