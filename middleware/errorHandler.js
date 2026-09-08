const { logEvents } = require('./logger')

const errorHandler = (err, req, res, next) => {
    logEvents(`${err.name}: ${err.message}\t${req.method}\t${req.url}\t
    ${req.headers.origin}`, 'errLog.log')
    console.log(err.stack)

    // Preserve an existing HTTP error status; otherwise default to 500.
    const status =
    res.statusCode >= 400 && res.statusCode < 600
        ? res.statusCode
        : 500

    res.status(status) 

    res.json({ message: err.message })
}

module.exports = errorHandler