const Note = require('../models/Note')
const User = require('../models/User')

// All note endpoints are public until authentication middleware is added.

const asyncHandler = require('express-async-handler')

// @desc Get all notes
// @route GET /notes
const getAllNotes = asyncHandler(async (req, res) => {
    const notes = await Note.find().lean()

    if(!notes?.length) {
        return res.status(400).json({ message: 'No notes found' })
    }

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
    const {user, title, text} = req.body

    if (!user || !title || !text) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    const duplicate = await Note.findOne({ title }).lean().exec()

    if (duplicate) {
        return res.status(409).json({ message: 'Duplicate note title' })
    }

    const note = await Note.create({ user, title, text })

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