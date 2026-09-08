const allowedOrigins = require('./allowedOrigins')

const corsOptions = {
    // Allow approved browser origins and clients without an Origin header, such as Postman.
    origin: (origin, callback) => {
        if(allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    }, 
    // Permit cookies on approved cross-origin requests.
    credentials: true
}

module.exports = corsOptions