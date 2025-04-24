// src/config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    apis: ['./src/routes/*.js', './src/controllers/*.js'],
    definition: {
    openapi: '3.0.0',
    info: {
      title: 'Library Management API',
      version: '1.0.0',
      description: 'API documentation for the Library Management System built with Express and Prisma',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`, // Base URL
        description: 'Development server',
      },
      {
        url: `https://lms-temp-be.vercel.app`, // Production URL
        description: 'Production server',
      }
    ],
    components: {
        // Define reusable schemas here to avoid repetition in controllers
        securitySchemes: {
            bearerAuth: { // Can be any name, referenced in route security tags
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Enter JWT Bearer token **_only_**' // Optional description
            }
        },
        schemas: {
            ErrorResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: {
                        type: 'object',
                        properties: {
                            message: { type: 'string' },
                            code: { type: 'string', nullable: true },
                        }
                    }
                }
            },
            NotFoundResponse: {
                 description: 'Resource not found',
                 content: {
                    'application/json': {
                        schema: { '$ref': '#/components/schemas/ErrorResponse' },
                        example: { success: false, error: { message: 'Resource not found' } }
                    }
                 }
            },
            BadRequestResponse: {
                 description: 'Invalid input or validation error',
                 content: {
                    'application/json': {
                        schema: { '$ref': '#/components/schemas/ErrorResponse' },
                        example: { success: false, error: { message: 'Invalid input data.' } }
                    }
                 }
            },
            ServerErrorResponse: {
                 description: 'Internal server error',
                 content: {
                    'application/json': {
                        schema: { '$ref': '#/components/schemas/ErrorResponse' },
                        example: { success: false, error: { message: 'Internal Server Error' } }
                    }
                 }
            },
            // --- Add Schemas for your Models ---
            Library: {
                type: 'object',
                properties: {
                    library_id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' }, address: { type: 'string', nullable: true }, city: { type: 'string', nullable: true }, state: { type: 'string', nullable: true }, country: { type: 'string', nullable: true },
                    created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
             User: {
                type: 'object',
                properties: {
                    user_id: { type: 'string', format: 'uuid' }, library_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string', format: 'email' },
                    role: { type: 'string', enum: ['Admin', 'Librarian', 'Member'] }, is_active: { type: 'boolean' }, borrowed_book_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    reserved_book_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, wishlist_book_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
             Genre: {
                type: 'object',
                properties: {
                    genre_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string', nullable: true },
                    created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
            Author: {
                type: 'object',
                properties: {
                    author_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, bio: { type: 'string', nullable: true },
                    book_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
            Book: {
                type: 'object',
                properties: {
                    book_id: { type: 'string', format: 'uuid' }, library_id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, isbn: { type: 'string', nullable: true }, description: { type: 'string', nullable: true },
                    total_copies: { type: 'integer', minimum: 0 }, available_copies: { type: 'integer', minimum: 0 }, reserved_copies: { type: 'integer', minimum: 0 },
                    author_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, genre_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    published_date: { type: 'string', format: 'date-time', nullable: true }, added_on: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
            Policy: {
                type: 'object',
                properties: {
                    policy_id: { type: 'string', format: 'uuid' }, library_id: { type: 'string', format: 'uuid' }, max_borrow_days: { type: 'integer', minimum: 1 }, fine_per_day: { type: 'number', format: 'float' },
                    max_books_per_user: { type: 'integer', minimum: 1 }, reservation_expiry_days: { type: 'integer', minimum: 1 },
                    created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
            BorrowTransaction: {
                 type: 'object',
                 properties: {
                     borrow_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' },
                     borrow_date: { type: 'string', format: 'date-time' }, return_date: { type: 'string', format: 'date-time', nullable: true }, status: { type: 'string', enum: ['borrowed', 'returned', 'overdue'] }
                 }
            },
            Reservation: {
                type: 'object',
                properties: {
                     reservation_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' },
                     reserved_at: { type: 'string', format: 'date-time' }, expires_at: { type: 'string', format: 'date-time', nullable: true }
                 }
            },
            Wishlist: {
                type: 'object',
                properties: {
                    wishlist_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' }, added_at: { type: 'string', format: 'date-time' }
                }
            },
             Review: {
                 type: 'object',
                 properties: {
                     review_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' },
                     rating: { type: 'integer', minimum: 1, maximum: 5, nullable: true }, comment: { type: 'string', nullable: true }, reviewed_at: { type: 'string', format: 'date-time' }
                 }
            },
            Ticket: {
                type: 'object',
                properties: {
                    ticket_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, resolved_by: { type: 'string', format: 'uuid', nullable: true },
                    type: { type: 'string' }, subject: { type: 'string' }, message: { type: 'string' }, status: { type: 'string', enum: ['open', 'in_progress', 'resolved'] },
                    created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
             Fine: {
                 type: 'object',
                 properties: {
                     fine_id: { type: 'string', format: 'uuid' }, borrow_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' }, library_id: { type: 'string', format: 'uuid' },
                     amount: { type: 'number', format: 'float' }, reason: { type: 'string', nullable: true }, is_paid: { type: 'boolean' },
                     fine_date: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                 }
            },
            DocumentUpload: {
                type: 'object',
                properties: {
                    upload_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid', nullable: true }, library_id: { type: 'string', format: 'uuid' },
                    file_url: { type: 'string', format: 'url' }, file_type: { type: 'string', nullable: true }, uploaded_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }
                }
            },
            // --- Input Schemas (for POST/PUT request bodies) ---
            LibraryInput: {
                 type: 'object', required: ['name'],
                 properties: { name: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, country: { type: 'string' } }
            },
             UserInput: {
                type: 'object', required: ['user_id', 'library_id', 'name', 'email', 'role'],
                properties: {
                    user_id: { type: 'string', format: 'uuid', description: 'MUST be provided, typically from an external auth system' },
                    library_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string', format: 'email' },
                    role: { type: 'string', enum: ['Admin', 'Librarian', 'Member'] }, is_active: { type: 'boolean', default: true },
                    // Arrays usually handled by specific endpoints, not on user create/update directly
                }
            },
             GenreInput: {
                type: 'object', required: ['name'],
                properties: { name: { type: 'string' }, description: { type: 'string' } }
            },
            AuthorInput: {
                type: 'object', required: ['name'],
                properties: { name: { type: 'string' }, bio: { type: 'string' }, book_ids: { type: 'array', items: { type: 'string', format: 'uuid'}, description: 'Optional: Initial list of book IDs' } }
            },
            BookInput: {
                type: 'object', required: ['library_id', 'title'],
                properties: {
                    library_id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, isbn: { type: 'string' }, description: { type: 'string' },
                    total_copies: { type: 'integer', minimum: 0 }, available_copies: { type: 'integer', minimum: 0 }, reserved_copies: { type: 'integer', minimum: 0 },
                    author_ids: { type: 'array', items: { type: 'string', format: 'uuid'} }, genre_ids: { type: 'array', items: { type: 'string', format: 'uuid'} },
                    published_date: { type: 'string', format: 'date-time' }
                }
            },
            PolicyInput: {
                 type: 'object', required: ['library_id', 'max_borrow_days', 'fine_per_day', 'max_books_per_user', 'reservation_expiry_days'],
                 properties: {
                    library_id: { type: 'string', format: 'uuid' }, max_borrow_days: { type: 'integer', minimum: 1 }, fine_per_day: { type: 'number', format: 'float', minimum: 0 },
                    max_books_per_user: { type: 'integer', minimum: 1 }, reservation_expiry_days: { type: 'integer', minimum: 1 }
                 }
            },
            BorrowTransactionInput: {
                 type: 'object', required: ['user_id', 'book_id'],
                 properties: {
                    user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['borrowed', 'returned', 'overdue'] }, // Usually set by logic, not direct input
                    return_date: { type: 'string', format: 'date-time' } // Usually set by return logic
                 }
            },
             ReservationInput: {
                type: 'object', required: ['user_id', 'book_id'],
                properties: { user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' } }
            },
            WishlistInput: {
                type: 'object', required: ['user_id', 'book_id'],
                properties: { user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' } }
            },
            ReviewInput: {
                type: 'object', required: ['user_id', 'book_id'],
                properties: {
                    user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' },
                    rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' }
                }
            },
            TicketInput: {
                type: 'object', required: ['user_id', 'type', 'subject', 'message'],
                properties: {
                    user_id: { type: 'string', format: 'uuid' }, type: { type: 'string' }, subject: { type: 'string' }, message: { type: 'string' },
                    resolved_by: { type: 'string', format: 'uuid', nullable: true }, status: { type: 'string', enum: ['open', 'in_progress', 'resolved'] }
                }
            },
            FineInput: {
                type: 'object', required: ['borrow_id', 'user_id', 'book_id', 'library_id', 'amount'],
                 properties: {
                     borrow_id: { type: 'string', format: 'uuid' }, user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid' }, library_id: { type: 'string', format: 'uuid' },
                     amount: { type: 'number', format: 'float', minimum: 0 }, reason: { type: 'string' }, is_paid: { type: 'boolean' }
                 }
            },
             DocumentUploadInput: {
                 type: 'object', required: ['user_id', 'library_id', 'file_url'],
                 properties: {
                     user_id: { type: 'string', format: 'uuid' }, book_id: { type: 'string', format: 'uuid', nullable: true }, library_id: { type: 'string', format: 'uuid' },
                     file_url: { type: 'string', format: 'url' }, file_type: { type: 'string' }
                 }
            },
            UnauthorizedResponse: {
                description: 'Unauthorized - Invalid or missing token, or token expired.',
                content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' }, example: { success: false, error: { message: 'Unauthorized: ...' } } } }
           },
           ForbiddenResponse: {
                description: 'Forbidden - User does not have the required role/permissions.',
                content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' }, example: { success: false, error: { message: 'Forbidden: Access denied...' } } }}}
        }
    },
  // Path to the API docs files (controllers and maybe routes)
  apis: ['./src/controllers/*.js', './src/routes/*.js'], // Point to files with JSDoc comments
}
}

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;