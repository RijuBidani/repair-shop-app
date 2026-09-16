const Note = require('../models/Note')
const User = require('../models/User')

// All note endpoints are public until authentication middleware is added.

const asyncHandler = require('express-async-handler')

// @desc Get all notes
// @route GET /notes
const getAllNotes = asyncHandler(async (req, res) => {

    const supportedParameters = new Set(['search', 'completed', 'page', 'limit'])

    const hasUnsupportedParameter = Object.keys(req.query).some(
        (parameter) => !supportedParameters.has(parameter)
    )

    if (hasUnsupportedParameter) {
        return res.status(400).json({
            message: 'Invalid parameter name(s)'
        })
    }

    const rawPage = req.query.page
    const rawLimit = req.query.limit
    const rawSearch = req.query.search
    const rawCompleted = req.query.completed

    let page, limit, search, completed

    if (Array.isArray(rawSearch) || Array.isArray(rawCompleted) 
        || Array.isArray(rawPage) || Array.isArray(rawLimit)) 
    {
        return res.status(400).json({ message: 'Parameter(s) repeated in query' })
    }

    if (rawPage === undefined) {
        page = 1
    } else {
        if (typeof rawPage !== 'string' || 
            !/^[1-9]\d*$/.test(rawPage) 
        ) {
            return res.status(400).json( {
                message: 'Page must be a positive integer'
            })
        }

        page = Number(rawPage)

        if (!Number.isSafeInteger(page)) {
            return res.status(400).
            json({ message: 'Page is too large' })
        }
    }

    if(rawLimit === undefined) {
        limit = 10
    } else {
        if (typeof rawLimit !== 'string' || 
            !/^[1-9]\d*$/.test(rawLimit)
        ) {
            return res.status(400).json({
                message: 'Limit must be a positive integer'
            })
        }

        limit = Number(rawLimit)

        if (!Number.isSafeInteger(limit)) {
            return res.status(400).
            json({ message: 'Limit is too large' })
        }

        if (limit > 50) {
            return res.status(400).json({
                message: 'Limit must be between 1 and 50'
            })
        }
    }

    const filter = {}

    if (rawSearch !== undefined) {
        if (typeof rawSearch === 'string') {
            search = rawSearch.trim()

            if (search !== '') {
                if (search.length > 100) {
                    return res.status(400).json({
                        message: 'Maximum search string length exceeded'
                    })
                }
            }

            const escapedSearch = RegExp.escape(search)

            filter.$or = [
                { title: { $regex: escapedSearch, $options: 'i' } },
                { text: { $regex: escapedSearch, $options: 'i' } }
            ]
        } else {
            return res.status(400).json({
                message: 'Non-string passed'
            })
        }
    }

    if (rawCompleted !== undefined) {
        if (typeof rawCompleted !== 'string') {
            return res.status(400).json({ message: 'Non-string passed' })
        }

        if (rawCompleted !== 'true' && rawCompleted !== 'false') {
            return res.status(400).json({
                message: 
                'Completed parameter must be either true or false (case-sensitive)'
            })
        }

        filter.completed = rawCompleted === 'true'
    }

    const notes = await Note.find(filter).lean()

    // Enrich notes in parallel with their assigned usernames.
    const notesWithUser = await Promise.all(notes.map(async (note) => {
        const user = await User.findById(note.user).lean().exec()
        return {
            ...note,
            username: user?.username ?? null
        }
    }))

    res.json(notesWithUser)
})

// @desc Create a new note
// @route POST /notes
const createNewNote = asyncHandler(async(req, res) => {
    const {user, title, text, completed} = req.body

    if (!user || !title || !text || typeof completed !== 'boolean') {
        return res.status(400).json({ message: 'All fields are required' })
    }

    const duplicate = await Note.findOne({ title }).lean().exec()

    if (duplicate) {
        return res.status(409).json({ message: 'Duplicate note title' })
    }

    const note = await Note.create({ user, title, text, completed })

    if (note) { 
        return res.status(201).json({ message: 'New note created' })
    } else {
        return res.status(400).json({ message: 'Invalid note data received' })
    }

})

// @desc Update a note
// @route PATCH /notes
const updateNote = asyncHandler(async (req, res) => {
    const { id, user, title, text, completed } = req.body

    // completed may be false, so validate its type rather than its truthiness.
    if (!id || !user || !title || !text || typeof completed !== 'boolean') {
        return res.status(400).json({ message: 'All fields are required' })
    }

    const note = await Note.findById(id).exec()

    if (!note) {
        return res.status(400).json({ message: 'Note not found' })
    }

    const duplicate = await Note.findOne({ title }).lean().exec()

    // Exclude the current note from the duplicate-title check.
    if (duplicate && duplicate._id.toString() !== id) {
        return res.status(409).json({ message: 'Duplicate note title' })
    }

    note.user = user
    note.title = title
    note.text = text
    note.completed = completed

    const updatedNote = await note.save()

    res.json(`'${updatedNote.title}' updated`)
})

// @desc Delete a note
// @route DELETE /notes
const deleteNote = asyncHandler(async (req, res) => {
    const { id } = req.body

    if(!id) {
        return res.status(400).json({ message: 'Note ID required' })
    }

    const note = await Note.findById(id).exec()

    if (!note) {
        return res.status(400).json({ message: 'Note not found' })
    }

    await note.deleteOne()

    const reply = `Note '${note.title}' with ID ${note._id} deleted`

    res.json(reply)

})

module.exports = {
    getAllNotes,
    createNewNote,
    updateNote,
    deleteNote
}