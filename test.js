// loadtest-books.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'; // For generating UUIDs

// --- Configuration ---
const BASE_URL = "https://www.anwinsharon.com/lms"// Set via -e BASE_URL=... or default
const API_PREFIX = '/api/v1';
const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6Ik9DbDNCWmZxVWJyRlNHRG8iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL21iZmhtd3h5d2RkeHZpbm9sbmtlLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJmNDg2MDUxNC0xMDNkLTRkODUtODE1Mi0xMDMwODk1M2QzZTkiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ3Mzc1MTE4LCJpYXQiOjE3NDY3NzAzMTgsImVtYWlsIjoiYW53aW5zaGFyb25AZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdLCJyb2xlIjoiYWRtaW4ifSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImFud2luc2hhcm9uQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6ImY0ODYwNTE0LTEwM2QtNGQ4NS04MTUyLTEwMzA4OTUzZDNlOSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzQ2NzcwMzE4fV0sInNlc3Npb25faWQiOiIxMjE3NDQ4MS1iNWFjLTRiNjktYjY3Ny1mYmJjMjdhMTMxZmEiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.VKFqGe7GCUI8m0gMpxdVylIY3DEzZ2PWhWu_abtldo0"; // IMPORTANT: Provide a valid JWT

// --- Custom Metrics (Optional but Recommended) ---
let getAllBooksTrend = new Trend('get_all_books_duration');
let getBookByIdTrend = new Trend('get_book_by_id_duration');
let createBookTrend = new Trend('create_book_duration');
let updateBookTrend = new Trend('update_book_duration');
let deleteBookTrend = new Trend('delete_book_duration');

let errorRate = new Rate('errors');
let booksCreated = new Counter('books_created');
let booksUpdated = new Counter('books_updated');
let booksDeleted = new Counter('books_deleted');

// --- Test Options ---
export const options = {
    stages: [
        // Ramp-up: Start with a few users, gradually increase
        { duration: '30s', target: 20 }, // Simulate 10 users for 30 seconds
        { duration: '1m', target: 20 },  // Stay at 10 users for 1 minute
        { duration: '30s', target: 30 }, // Ramp up to 20 users over 30 seconds
        { duration: '1m', target: 30 },  // Stay at 20 users for 1 minute
        // Spike test (optional):
        { duration: '10s', target: 50 },
        { duration: '30s', target: 50 },
        // Ramp-down:
        { duration: '30s', target: 0 },   // Ramp down to 0 users
    ],
    thresholds: {
        'http_req_duration': ['p(95)<500'], // 95% of requests should be below 500ms
        'http_req_failed': ['rate<0.01'],   // Request failure rate should be less than 1%
        'errors': ['rate<0.01'],            // Custom error rate (checked in script)
        'get_all_books_duration': ['p(95)<600'],
        'get_book_by_id_duration': ['p(95)<300'],
        'create_book_duration': ['p(95)<700'],
    },
    // Optional: Define scenarios for different user behaviors
    // scenarios: {
    //   read_heavy: { /* ... */ },
    //   write_heavy: { /* ... */ }
    // }
};

// --- Helper Functions ---
function getHeaders() {
    return {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json',
    };
}

// --- Setup Function (Runs once before the test) ---
export function setup() {
    // Prepare data needed for the test (e.g., create a library, authors, genres if they don't exist)
    // This helps make tests more repeatable and isolated.
    // IMPORTANT: This runs in a separate K6 instance, so you can't share complex objects directly with VU code.
    // Return simple data like IDs.

    console.log('Setting up test data...');
    let libraryId, authorId1, authorId2, genreId1;

    // Example: Create a library (replace with your actual create logic if needed)
    const libraryPayload = { name: `Test Library ${uuidv4().substring(0, 8)}`, city: "Test City" };
    let res = http.post(`${BASE_URL}${API_PREFIX}/libraries`, JSON.stringify(libraryPayload), { headers: getHeaders() });
    if (res.status === 201 && res.json().library_id) {
        libraryId = res.json().library_id;
        console.log(`Created library: ${libraryId}`);
    } else {
        console.error(`Failed to create library for setup: ${res.status} ${res.body}`);
        // Attempt to find an existing library if creation fails (less ideal for pure tests)
        res = http.get(`${BASE_URL}${API_PREFIX}/libraries?limit=1`, { headers: getHeaders() });
        if (res.status === 200 && res.json().data && res.json().data.length > 0) {
            libraryId = res.json().data[0].library_id;
            console.log(`Using existing library: ${libraryId}`);
        } else {
            throw new Error('Setup failed: Could not create or find a library.');
        }
    }

    // Example: Create authors
    const authorPayload1 = { name: `Test Author ${uuidv4().substring(0,8)}` };
    res = http.post(`${BASE_URL}${API_PREFIX}/authors`, JSON.stringify(authorPayload1), { headers: getHeaders() });
    authorId1 = res.status === 201 ? res.json().author_id : null;
    if(authorId1) console.log(`Created author1: ${authorId1}`);

    const authorPayload2 = { name: `Test Author ${uuidv4().substring(0,8)}` };
    res = http.post(`${BASE_URL}${API_PREFIX}/authors`, JSON.stringify(authorPayload2), { headers: getHeaders() });
    authorId2 = res.status === 201 ? res.json().author_id : null;
    if(authorId2) console.log(`Created author2: ${authorId2}`);


    // Example: Create a genre
    const genrePayload1 = { name: `Test Genre ${uuidv4().substring(0,8)}` };
    res = http.post(`${BASE_URL}${API_PREFIX}/genres`, JSON.stringify(genrePayload1), { headers: getHeaders() });
    genreId1 = res.status === 201 ? res.json().genre_id : null;
    if(genreId1) console.log(`Created genre1: ${genreId1}`);


    if (!libraryId || !authorId1 || !genreId1) {
        throw new Error('Setup failed: Missing essential data (library, author, or genre).');
    }

    return { libraryId, authorId1, authorId2, genreId1, createdBookIds: [] }; // Pass data to VUs
}


// --- Teardown Function (Runs once after the test) ---
export function teardown(data) {
    console.log('Tearing down test data...' + data);
    if (data.createdBookIds && data.createdBookIds.length > 0) {
        console.log(`Cleaning up ${data.createdBookIds.length} created books...`);
        data.createdBookIds.forEach(bookId => {
            const res = http.del(`${BASE_URL}${API_PREFIX}/books/${bookId}`, null, { headers: getHeaders() });
            if (res.status !== 204) {
                console.warn(`Failed to delete book ${bookId}: ${res.status} ${res.body}`);
            }
        });
    }
    // You might also want to delete the authors, genres, library created in setup if they are purely for testing.
}


// --- Main Test Logic (Virtual User code) ---
export default function (data) { // `data` comes from setup()
    if (!JWT_TOKEN || JWT_TOKEN === 'your_default_jwt_token_here') {
        console.error('JWT_TOKEN is not set. Skipping VU execution.');
        return; // Don't run if token isn't properly configured
    }
    if (!data || !data.libraryId || !data.authorId1 || !data.genreId1) {
        console.error('Setup data (libraryId, authorId, genreId) not available. Skipping VU execution.');
        return;
    }

    const headers = getHeaders();
    let bookIdToModify; // To store ID of a created book for update/delete tests

    group('Get All Books (List View)', function () {
        const params = {
            page: Math.floor(Math.random() * 5) + 1, // Random page 1-5
            limit: 10,
            sortBy: 'title',
            sortOrder: 'asc',
            // Randomly apply some filters
            ...(Math.random() < 0.3 && { libraryId: data.libraryId }),
            ...(Math.random() < 0.2 && { authorId: data.authorId1 }),
            ...(Math.random() < 0.2 && { genreId: data.genreId1 }),
            ...(Math.random() < 0.1 && { available: 'true' }),
            ...(Math.random() < 0.1 && { search: 'Test' }),
        };
        const queryParams = Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&');

        const res = http.get(`${BASE_URL}${API_PREFIX}/books?${queryParams}`, { headers, tags: { name: 'GetAllBooks' } });
        check(res, {
            'GET /books status is 200': (r) => r.status === 200,
            'GET /books has data': (r) => r.json() && r.json().data && r.json().data.length >= 0,
        }) || errorRate.add(1);
        getAllBooksTrend.add(res.timings.duration);
        sleep(Math.random() * 2 + 1); // Think time: 1-3 seconds
    });


    group('CRUD Operations on Books', function () {
        // --- Create Book (POST) ---
        // Reduce frequency of create operations compared to reads
        // ... inside the default function (VU code) ...
    group('CRUD Operations on Books', function () {
        // --- Create Book (POST) ---
        if (__ITER % 5 === 0) { // Run create every 5 iterations per VU
            // --- OPTIONALLY: Fetch actual genre names for more realistic data ---
            // This adds an HTTP call, so use sparingly or pre-fetch in setup if critical
            let fetchedGenreNames = [];
            if (data.genreId1 && Math.random() < 0.5) { // Randomly decide to fetch a genre name
                 // Assuming you have a GET /genres/:id endpoint
                 const genreRes = http.get(`${BASE_URL}${API_PREFIX}/genres/${data.genreId1}`, { headers });
                 if (genreRes.status === 200 && genreRes.json() && genreRes.json().name) {
                     fetchedGenreNames.push(genreRes.json().name);
                 }
            }
            // --- End optional genre name fetch ---

            const bookPayload = {
                title: `K6 Test Book ${uuidv4().substring(0,8)}`,
                library_id: data.libraryId,
                isbn: `978-3-${Math.floor(Math.random() * 90000) + 10000}-${Math.floor(Math.random() * 9)}`,
                description: "A book created during K6 load testing.",
                total_copies: Math.floor(Math.random() * 5) + 1,
                available_copies: 1, // Ensure this is <= total_copies
                reserved_copies: 0, // Good to explicitly set this
                author_ids: [data.authorId1, data.authorId2].filter(id => id && Math.random() < 0.7),
                genre_ids: [data.genreId1].filter(id => id && Math.random() < 0.8), // Still send genre_ids
                published_date: new Date(Date.now() - Math.floor(Math.random() * 365 * 5 * 24 * 60 * 60 * 1000)).toISOString(), // Random date in last 5 years
                cover_image_url: Math.random() < 0.3 ? `https://picsum.photos/seed/${uuidv4().substring(0,6)}/200/300` : null, // Optional cover image

                // --- ADD genre_names FIELD ---
                // Option 1: Use fetched names (if implemented above)
                // genre_names: fetchedGenreNames,

                // Option 2: If you fetched genre names in setup and passed them in `data`
                // genre_names: data.genreId1 && data.genre1Name ? [data.genre1Name] : [], // Example if you had genre1Name in data

                // Option 3: Simplest - provide a placeholder or derive from genre_ids if you know the names
                // For testing, an empty array or a simple static name might be sufficient if actual names aren't critical for load.
                // If your logic for `genre_names` is supposed to be populated server-side based on `genre_ids`,
                // then sending an empty array `[]` might be what your API expects if you're not providing them.
                // **CONSULT YOUR API's `createBook` LOGIC FOR WHAT IT EXPECTS for `genre_names`.**
                // Let's assume for now it's okay to send a static name or an empty array if the actual name matching
                // the ID isn't readily available in the K6 script's `data` object from setup.
                genre_names: (data.genreId1 && Math.random() < 0.8) ? ["Test Genre Name"] : ["Test Genre Name"], // Placeholder if genreId1 is used
                                                                                            // Or just `[]` if the server handles it
            };

            // Ensure available_copies is not > total_copies
            if (bookPayload.available_copies > bookPayload.total_copies) {
                bookPayload.available_copies = bookPayload.total_copies;
            }


            const resCreate = http.post(`${BASE_URL}${API_PREFIX}/books`, JSON.stringify(bookPayload), { headers, tags: { name: 'CreateBook' } });
            check(resCreate, {
                'POST /books status is 201': (r) => {
                    if (r.status !== 201) console.error(`Create Book Error (${r.status}): ${r.body}`);
                    return r.status === 201;
                },
                'POST /books returns book_id': (r) => r.json() && r.json().book_id,
            }) || errorRate.add(1);
            createBookTrend.add(resCreate.timings.duration);
            if (resCreate.status === 201 && resCreate.json().book_id) {
                bookIdToModify = resCreate.json().book_id;
                data.createdBookIds.push(bookIdToModify);
                booksCreated.add(1);
            }
            sleep(1);
        }
// ... rest of the CRUD operations group ...
    });
// ... rest of the K6 script ...

        // Only proceed with GetById, Update, Delete if a book was created or we have one from setup
        // For more robust testing, you might pre-populate books or fetch existing ones in setup
        if (!bookIdToModify && data.createdBookIds.length > 0) {
            bookIdToModify = data.createdBookIds[Math.floor(Math.random() * data.createdBookIds.length)]; // Pick a random one
        }

        if (bookIdToModify) {
            // --- Get Book By ID (GET) ---
            const resGetById = http.get(`${BASE_URL}${API_PREFIX}/books/${bookIdToModify}`, { headers, tags: { name: 'GetBookById' } });
            check(resGetById, {
                'GET /books/:id status is 200': (r) => r.status === 200,
                'GET /books/:id has correct ID': (r) => r.json() && r.json().book_id === bookIdToModify,
            }) || errorRate.add(1);
            getBookByIdTrend.add(resGetById.timings.duration);
            sleep(1);


            // --- Update Book (PUT) ---
            // Reduce frequency
            if (__ITER % 7 === 0) {
                const updatePayload = {
                    title: `Updated K6 Book ${uuidv4().substring(0,8)}`,
                    description: "This book has been updated by K6.",
                    available_copies: Math.floor(Math.random() * 3), // Potentially change availability
                };
                const resUpdate = http.put(`${BASE_URL}${API_PREFIX}/books/${bookIdToModify}`, JSON.stringify(updatePayload), { headers, tags: { name: 'UpdateBook' } });
                check(resUpdate, {
                    'PUT /books/:id status is 200': (r) => r.status === 200,
                    'PUT /books/:id returns updated title': (r) => r.json() && r.json().title === updatePayload.title,
                }) || errorRate.add(1);
                updateBookTrend.add(resUpdate.timings.duration);
                if (resUpdate.status === 200) booksUpdated.add(1);
                sleep(1);
            }

            // --- Delete Book (DELETE) ---
            // Reduce frequency and make it less likely to delete all created books immediately
            if (__ITER % 10 === 0 && Math.random() < 0.3) {
                const resDelete = http.del(`${BASE_URL}${API_PREFIX}/books/${bookIdToModify}`, null, { headers, tags: { name: 'DeleteBook' } });
                check(resDelete, {
                    'DELETE /books/:id status is 204': (r) => r.status === 204,
                }) || errorRate.add(1);
                deleteBookTrend.add(resDelete.timings.duration);
                if (resDelete.status === 204) {
                    booksDeleted.add(1);
                    // Remove from list so we don't try to delete it again in teardown
                    const index = data.createdBookIds.indexOf(bookIdToModify);
                    if (index > -1) data.createdBookIds.splice(index, 1);
                    bookIdToModify = null; // Don't try to use it again in this iteration
                }
                sleep(1);
            }
        } else {
            // If no book created/found, maybe just do another Get All or sleep
            sleep(1);
        }
    });
}