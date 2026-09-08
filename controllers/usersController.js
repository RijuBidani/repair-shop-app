const User = require('../models/User')
const Note = require('../models/Note')

// All user endpoints are public until authentication middleware is added.

const asyncHandler = require('express-async-handler')
const bcrypt = require('bcrypt')

const BCRYPT_SALT_ROUNDS = 10

// @desc Get all users
// @route GET /users
const getAllUsers = asyncHandler (async (req, res) => {
    // Never expose password hashes in API responses.
    const users = await User.find().select('-password').lean()
    
    if (!users?.length) {
        return res.status(400).json({ message: 'No users found' })
    }
    
    res.json(users)
})

// @desc Create new user
// @route POST /users
const createNewUser = asyncHandler (async (req, res) => {
    
    const { username, password, roles } = req.body

    if (!username || !password || !Array.isArray(roles) || !roles.length) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    const duplicate = await User.findOne({ username }).lean().exec()

    if (duplicate) {
        return res.status(409).json({ message: 'Duplicate username' })
    }

    const hashedPwd = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) 

    const userObject = { username, "password": hashedPwd, roles }

    const user = await User.create(userObject)

    if (user) {
        res.status(201).json({ message: `New user ${username} created` })
    } else {
        res.status(400).json({ message: 'Invalid user data received' })
    }

})

// @desc Update a user
// @route PATCH /users
const updateUser = asyncHandler (async (req, res) => {
    const { id, username, roles, active, password } = req.body

    // active may be false, so validate its type rather than its truthiness.
    if (!id || !username || !Array.isArray(roles) || !roles.length || typeof active !== 'boolean') {
        return res.status(400).json({ message: 'All fields are required' })
    }

    // Keep the Mongoose document instance because it is saved below.
    const user = await User.findById(id).exec()

    if(!user) {
        return res.status(400).json({ message: 'User not found' })
    }

    const duplicate = await User.findOne({ username }).lean().exec()
    
    // Exclude the current user from the duplicate-username check.
    if (duplicate && duplicate._id.toString() !== id) {
        return res.status(409).json({ message: 'Duplicate username' })
    }

    user.username = username
    user.roles = roles
    user.active = active

    // Preserve the existing password unless a replacement is supplied.
    if (password) {
        user.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) 
    }

    const updatedUser = await user.save()

    res.json({ message: `${updatedUser.username} updated` })
})

// @desc Delete a user
// @route DELETE /users
const deleteUser = asyncHandler (async (req, res) => {
    const { id } = req.body

    if (!id) {
        return res.status(400).json({ message: 'User ID Required' })
    }

    // Preserve referential integrity by blocking deletion of users with assigned notes.
    const note = await Note.findOne({ user: id }).lean().exec()

    if(note) {
        return res.status(400).json({ message: 'User has assigned notes' })
    }

    const user = await User.findById(id).exec()

    if (!user) {
        return res.status(400).json({ message: 'User not found' })
    }

    await user.deleteOne()

    const reply = `Username ${user.username} with ID ${user._id} deleted`

    res.json(reply)
})

module.exports = {
    getAllUsers,
    createNewUser,
    updateUser,
    deleteUser
}