const Note = require('../models/Note')
const User = require('../models/User')

// All note endpoints are public until authentication middleware is added.

const asyncHandler = require('express-async-handler')

//global variable
const SUPPORTED_PARAMETERS = new Set([
    'search',
    'completed',
    'page',
    'limit'
])

//integer parameter validation
const parsePositiveIntegerParameter = (
    rawValue,
    {
        name,
        defaultValue,
        max
    }
) => {
    if (rawValue === undefined) {
        return { value: defaultValue }
    }

    if (
        typeof rawValue !== 'string' ||
        !/^[1-9]\d*$/.test(rawValue)
    ) {
        return {
            error: `${name} must be a positive integer`
        }
    }

    const value = Number(rawValue)

    if (!Number.isSafeInteger(value)) {
        return {
            error: `${name} is too large`
        }
    }

    if (max !== undefined && value > max) {
        return {
            error: `${name} must be between 1 and ${max}`
        }
    }

    return { value }
}

//Contract-based parameter validation helper
const parseNotesQuery = (query) => {
    const hasUnsupportedParameter = Object.keys(query).some(
        parameter => !SUPPORTED_PARAMETERS.has(parameter)
    )

    if (hasUnsupportedParameter) {
        return {
            error: 'Invalid parameter name(s)'
        }
    }

    const {
        search: rawSearch,
        completed: rawCompleted,
        page: rawPage,
        limit: rawLimit
    } = query

    if (
        Array.isArray(rawSearch) ||
        Array.isArray(rawCompleted) ||
        Array.isArray(rawPage) ||
        Array.isArray(rawLimit)
    ) {
        return {
            error: 'Parameter(s) repeated in query'
        }
    }

    const pageResult = parsePositiveIntegerParameter(
        rawPage,
        {
            name: 'Page',
            defaultValue: 1
        }
    )

    if (pageResult.error) {
        return pageResult
    }

    const limitResult = parsePositiveIntegerParameter(
        rawLimit,
        {
            name: 'Limit',
            defaultValue: 10,
            max: 50
        }
    )

    if (limitResult.error) {
        return limitResult
    }

    let search

    if (rawSearch !== undefined) {
        if (typeof rawSearch !== 'string') {
            return {
                error: 'Non-string passed'
            }
        }

        search = rawSearch.trim()

        if (search.length > 100) {
            return {
                error: 'Maximum search string length exceeded'
            }
        }
    }

    let completed

    if (rawCompleted !== undefined) {
        if (typeof rawCompleted !== 'string') {
            return {
                error: 'Non-string passed'
            }
        }

        if (
            rawCompleted !== 'true' &&
            rawCompleted !== 'false'
        ) {
            return {
                error:
                    'Completed parameter must be either true or false (case-sensitive)'
            }
        }

        completed = rawCompleted === 'true'
    }

    return {
        value: {
            page: pageResult.value,
            limit: limitResult.value,
            search,
            completed
        }
    }
}

//MongoDB filter construction
const escapeRegExp = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const buildNotesFilter = ({ search, completed }) => {
    const filter = {}

    if (search) {
        const escapedSearch = escapeRegExp(search)

        filter.$or = [
            {
                title: {
                    $regex: escapedSearch,
                    $options: 'i'
                }
            },
            {
                text: {
                    $regex: escapedSearch,
                    $options: 'i'
                }
            }
        ]
    }

    if (completed !== undefined) {
        filter.completed = completed
    }

    return filter
}

//Pagination metadata helper
const buildPagination = ({
    page,
    limit,
    total
}) => {
    const totalPages = Math.ceil(total / limit)

    return {
        page,
        limit,
        totalNotes: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: totalPages > 0 && page > 1
    }
}

// @desc Get all notes
// @route GET /notes
const getAllNotes = asyncHandler(async (req, res) => {

    const queryResult = parseNotesQuery(req.query)

    if (queryResult.error) {
        return res.status(400).json({
            message: queryResult.error
        })
    }

    const {
        page,
        limit,
        search,
        completed
    } = queryResult.value

    const filter = buildNotesFilter({
        search,
        completed
    })

    const recordsToSkip = (page - 1) * limit

    const options = {
        sort: {
            updatedAt: -1,
            _id: -1
        },
        skip: recordsToSkip,
        limit
    }

    const notes = await Note
        .find(filter, null, options)
        .lean()
        .exec()

    const total = await Note
        .countDocuments(filter)
        .exec()

    // Enrich notes in parallel with their assigned usernames.
    const notesWithUser = await Promise.all(
        notes.map(async (note) => {
            const user = await User
                .findById(note.user)
                .lean()
                .exec()

            return {
                ...note,
                username: user?.username ?? null
            }
        })
    )

    const pagination = buildPagination({
        page,
        limit,
        total
    })

    return res.json({
        notes: notesWithUser,
        pagination
    })
})

// @desc Create a new note
// @route POST /notes
const createNewNote = asyncHandler(async(req, res) => {
    const {user, title, text, completed} = req.body

    if (!user || !title || !text) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    if (completed !== undefined && typeof completed !== 'boolean') {
        return res.status(400).json({
            message: 'Completed must be a boolean'
        })
    }

    const duplicate = await Note.findOne({ title }).lean().exec()

    if (duplicate) {
        return res.status(409).json({ message: 'Duplicate note title' })
    }

    const noteObject = { user, title, text }

    if (completed !== undefined) {
        noteObject.completed = completed
    }

    const note = await Note.create(noteObject)

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