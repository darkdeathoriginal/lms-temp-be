const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * /api/v1/analytics:
 *   get:
 *     summary: Get comprehensive library analytics
 *     tags: [Admin, Analytics]
 *     description: >
 *       Provides complete analytics data for admin dashboard including fine reports,
 *       circulation statistics, catalog insights, and detailed breakdowns.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: library_id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Library ID to get analytics for
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *       403:
 *         description: Forbidden - User not authorized to access this data
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.getAnalytics = async (req, res, next) => {
    try {
        const { library_id } = req.query;

        if (!library_id) {
            return res.status(400).json({
                success: false,
                error: { message: 'Missing required parameter: library_id' }
            });
        }

        // Current date for calculations
        const currentDate = new Date();

        // Get dates for time-based calculations
        const oneMonthAgo = new Date(currentDate);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const twoMonthsAgo = new Date(currentDate);
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        const threeMonthsAgo = new Date(currentDate);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const fourMonthsAgo = new Date(currentDate);
        fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

        const oneWeekAgo = new Date(currentDate);
        oneWeekAgo.setDate(currentDate.getDate() - 7);

        // For daily circulation chart (last 7 days)
        const weekDays = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date(currentDate);
            day.setDate(currentDate.getDate() - i);
            weekDays.push(day);
        }

        // Batch queries to improve performance
        const [
            // Book data
            bookRecords,
            newBooksCount,

            // Library policy
            policy,

            // All borrowed transactions
            allBorrowedBooks,

            // Fine data
            fineData,
            finesPaid,
            finesPending
        ] = await Promise.all([
            // Total books - get all books with their copy counts
            prisma.book.findMany({
                where: { library_id },
                select: {
                    total_copies: true,
                    available_copies: true,
                    reserved_copies: true,
                    added_on: true,
                    genre_names: true
                }
            }),

            // New books (last week)
            prisma.book.count({
                where: {
                    library_id,
                    added_on: { gte: oneWeekAgo }
                }
            }),

            // Library policy for calculating overdue
            prisma.policy.findUnique({
                where: { library_id }
            }),

            // All current borrowed books
            prisma.borrowTransaction.findMany({
                where: {
                    library_id,
                    status: 'borrowed'
                }
            }),

            // Total fines
            prisma.fine.aggregate({
                where: { library_id },
                _sum: { amount: true },
            }),

            // Paid fines
            prisma.fine.aggregate({
                where: {
                    library_id,
                    is_paid: true
                },
                _sum: { amount: true },
            }),

            // Pending fines
            prisma.fine.aggregate({
                where: {
                    library_id,
                    is_paid: false
                },
                _sum: { amount: true },
            })
        ]);

        // Calculate total copies and available copies
        const totalBooksCount = bookRecords.reduce((sum, book) => sum + book.total_copies, 0);
        const availableBooks = bookRecords.reduce((sum, book) => sum + book.available_copies, 0);
        const reservedBooksTotal = bookRecords.reduce((sum, book) => sum + book.reserved_copies, 0);

        // Process genre data
        const genreCounts = {};
        bookRecords.forEach(book => {
            book.genre_names.forEach(genre => {
                genreCounts[genre] = (genreCounts[genre] || 0) + book.total_copies;
            });
        });

        // Process borrowed books data
        const borrowedBooksCount = allBorrowedBooks.length;

        // Calculate max borrow days
        const maxBorrowDays = policy?.max_borrow_days || 14;

        // Calculate overdue date thresholds
        const overdueDate = new Date(currentDate);
        overdueDate.setDate(overdueDate.getDate() - maxBorrowDays);

        const overduePlus7Date = new Date(overdueDate);
        overduePlus7Date.setDate(overduePlus7Date.getDate() - 7);

        const overduePlus14Date = new Date(overduePlus7Date);
        overduePlus14Date.setDate(overduePlus14Date.getDate() - 7);

        // Filter overdue books
        const overdueBooks = allBorrowedBooks.filter(book =>
            new Date(book.borrow_date) < overdueDate
        );

        const overdueBooksCount = overdueBooks.length;

        // Filter overdue books by duration
        const overdue1To7Days = allBorrowedBooks.filter(book => {
            const borrowDate = new Date(book.borrow_date);
            return borrowDate < overdueDate && borrowDate >= overduePlus7Date;
        }).length;

        const overdue8To14Days = allBorrowedBooks.filter(book => {
            const borrowDate = new Date(book.borrow_date);
            return borrowDate < overduePlus7Date && borrowDate >= overduePlus14Date;
        }).length;

        const overdue15PlusDays = allBorrowedBooks.filter(book => {
            const borrowDate = new Date(book.borrow_date);
            return borrowDate < overduePlus14Date;
        }).length;

        // Calculate books due soon
        const booksDueToday = allBorrowedBooks.filter(book => {
            const dueDate = new Date(book.borrow_date);
            dueDate.setDate(dueDate.getDate() + maxBorrowDays);
            const today = new Date(currentDate);
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            return dueDate >= today && dueDate < tomorrow;
        }).length;

        const booksDueThisWeek = allBorrowedBooks.filter(book => {
            const dueDate = new Date(book.borrow_date);
            dueDate.setDate(dueDate.getDate() + maxBorrowDays);
            const today = new Date(currentDate);
            today.setHours(0, 0, 0, 0);
            const nextDay = new Date(today);
            nextDay.setDate(nextDay.getDate() + 1);
            const weekFromNow = new Date(today);
            weekFromNow.setDate(weekFromNow.getDate() + 7);

            return dueDate >= nextDay && dueDate < weekFromNow;
        }).length;

        const booksDueNextWeek = allBorrowedBooks.filter(book => {
            const dueDate = new Date(book.borrow_date);
            dueDate.setDate(dueDate.getDate() + maxBorrowDays);
            const weekFromNow = new Date(currentDate);
            weekFromNow.setHours(0, 0, 0, 0);
            weekFromNow.setDate(weekFromNow.getDate() + 7);
            const twoWeeksFromNow = new Date(weekFromNow);
            twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 7);

            return dueDate >= weekFromNow && dueDate < twoWeeksFromNow;
        }).length;

        // Get daily circulation counts
        const dailyCirculation = await Promise.all(weekDays.map(async (day) => {
            const startOfDay = new Date(day);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(day);
            endOfDay.setHours(23, 59, 59, 999);

            const count = await prisma.borrowTransaction.count({
                where: {
                    library_id,
                    borrow_date: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                }
            });

            return {
                date: day.toISOString().split('T')[0],
                dayOfWeek: day.toLocaleDateString('en-US', { weekday: 'short' }),
                count
            };
        }));

        // Calculate total circulation
        const totalCirculation = dailyCirculation.reduce((sum, day) => sum + day.count, 0);

        // Get most borrowed book
        const mostBorrowedBooks = await prisma.borrowTransaction.groupBy({
            by: ['book_id'],
            where: { library_id },
            _count: { book_id: true },
            orderBy: {
                _count: {
                    book_id: 'desc'
                }
            },
            take: 1
        });

        let mostBorrowedBook = null;
        if (mostBorrowedBooks.length > 0) {
            const bookDetails = await prisma.book.findUnique({
                where: { book_id: mostBorrowedBooks[0].book_id }
            });

            mostBorrowedBook = {
                ...bookDetails,
                borrowCount: mostBorrowedBooks[0]._count.book_id
            };
        }

        // Get book genre breakdown
        const [overdueBookIds, recentlyAddedBooks] = await Promise.all([
            // Overdue book IDs for genre analysis
            overdueBooks.length > 0 ? prisma.book.findMany({
                where: {
                    book_id: { in: overdueBooks.map(book => book.book_id) }
                },
                select: { genre_names: true }
            }) : [],

            // Recently added books
            prisma.book.findMany({
                where: {
                    library_id,
                    added_on: { gte: oneWeekAgo }
                },
                orderBy: { added_on: 'desc' },
                take: 5
            })
        ]);

        // Process overdue by category
        const categoryOverdueMap = {};
        overdueBookIds.forEach(book => {
            book.genre_names.forEach(genre => {
                categoryOverdueMap[genre] = (categoryOverdueMap[genre] || 0) + 1;
            });
        });

        // Process borrowed books by category
        const borrowedGenreCounts = {};
        if (borrowedBooksCount > 0) {
            const borrowedBookIds = await prisma.book.findMany({
                where: {
                    book_id: { in: allBorrowedBooks.map(book => book.book_id) }
                },
                select: { genre_names: true }
            });

            borrowedBookIds.forEach(book => {
                book.genre_names.forEach(genre => {
                    borrowedGenreCounts[genre] = (borrowedGenreCounts[genre] || 0) + 1;
                });
            });
        }

        // Calculate new books by category
        const newBookCategories = {};
        recentlyAddedBooks.forEach(book => {
            book.genre_names.forEach(genre => {
                newBookCategories[genre] = (newBookCategories[genre] || 0) + 1;
            });
        });

        // Get fine collection trends
        const [
            currentMonthFines,
            lastMonthFines,
            twoMonthsAgoFines,
            threeMonthsAgoFines
        ] = await Promise.all([
            prisma.fine.aggregate({
                where: {
                    library_id,
                    fine_date: { gte: oneMonthAgo }
                },
                _sum: { amount: true },
            }),

            prisma.fine.aggregate({
                where: {
                    library_id,
                    fine_date: {
                        gte: twoMonthsAgo,
                        lt: oneMonthAgo
                    }
                },
                _sum: { amount: true },
            }),

            prisma.fine.aggregate({
                where: {
                    library_id,
                    fine_date: {
                        gte: threeMonthsAgo,
                        lt: twoMonthsAgo
                    }
                },
                _sum: { amount: true },
            }),

            prisma.fine.aggregate({
                where: {
                    library_id,
                    fine_date: {
                        gte: fourMonthsAgo,
                        lt: threeMonthsAgo
                    }
                },
                _sum: { amount: true },
            })
        ]);

        // Get circulation trends
        const [
            currentMonthCirculation,
            previousMonthCirculation
        ] = await Promise.all([
            prisma.borrowTransaction.count({
                where: {
                    library_id,
                    borrow_date: { gte: oneMonthAgo }
                }
            }),

            prisma.borrowTransaction.count({
                where: {
                    library_id,
                    borrow_date: {
                        gte: twoMonthsAgo,
                        lt: oneMonthAgo
                    }
                }
            })
        ]);

        // Calculate growth rate
        let circulationGrowthRate = 0;
        if (previousMonthCirculation > 0) {
            circulationGrowthRate = ((currentMonthCirculation - previousMonthCirculation) / previousMonthCirculation) * 100;
        }

        // Get book collection trends
        const [
            booksCountCurrentMonth,
            booksCountLastMonth,
            booksCountTwoMonthsAgo,
            booksCountThreeMonthsAgo
        ] = await Promise.all([
            prisma.book.findMany({
                where: {
                    library_id,
                    added_on: { lte: currentDate }
                },
                select: { total_copies: true }
            }).then(books => books.reduce((sum, book) => sum + book.total_copies, 0)),

            prisma.book.findMany({
                where: {
                    library_id,
                    added_on: { lte: oneMonthAgo }
                },
                select: { total_copies: true }
            }).then(books => books.reduce((sum, book) => sum + book.total_copies, 0)),

            prisma.book.findMany({
                where: {
                    library_id,
                    added_on: { lte: twoMonthsAgo }
                },
                select: { total_copies: true }
            }).then(books => books.reduce((sum, book) => sum + book.total_copies, 0)),

            prisma.book.findMany({
                where: {
                    library_id,
                    added_on: { lte: threeMonthsAgo }
                },
                select: { total_copies: true }
            }).then(books => books.reduce((sum, book) => sum + book.total_copies, 0))
        ]);

        // Get borrowed books trend
        const [
            borrowedCountCurrentMonth,
            borrowedCountLastMonth,
            borrowedCountTwoMonthsAgo,
            borrowedCountThreeMonthsAgo
        ] = await Promise.all([
            prisma.borrowTransaction.count({
                where: {
                    library_id,
                    status: 'borrowed',
                    borrow_date: { lte: currentDate }
                }
            }),

            prisma.borrowTransaction.count({
                where: {
                    library_id,
                    status: 'borrowed',
                    borrow_date: { lte: oneMonthAgo }
                }
            }),

            prisma.borrowTransaction.count({
                where: {
                    library_id,
                    status: 'borrowed',
                    borrow_date: { lte: twoMonthsAgo }
                }
            }),

            prisma.borrowTransaction.count({
                where: {
                    library_id,
                    status: 'borrowed',
                    borrow_date: { lte: threeMonthsAgo }
                }
            })
        ]);

        // Create analytics data structure without repetition
        const analyticsData = {
            dashboard: {
                fineReports: {
                    totalFines: fineData._sum.amount || 0,
                    overdueBooks: overdueBooksCount
                },
                circulationStatistics: {
                    dailyCirculation,
                    totalCirculation
                },
                mostBorrowedBook,
                catalogInsights: {
                    totalBooks: totalBooksCount,
                    newBooks: newBooksCount,
                    borrowedBooks: borrowedBooksCount
                }
            },

            details: {
                fines: {
                    totalFines: fineData._sum.amount || 0,
                    breakdown: {
                        collected: finesPaid._sum.amount || 0,
                        pending: finesPending._sum.amount || 0
                    },
                    monthlyTrend: {
                        currentMonth: currentMonthFines._sum.amount || 0,
                        lastMonth: lastMonthFines._sum.amount || 0,
                        twoMonthsAgo: twoMonthsAgoFines._sum.amount || 0,
                        threeMonthsAgo: threeMonthsAgoFines._sum.amount || 0
                    }
                },

                overdueBooks: {
                    total: overdueBooksCount,
                    byDuration: {
                        '1-7Days': overdue1To7Days,
                        '8-14Days': overdue8To14Days,
                        '15+Days': overdue15PlusDays
                    },
                    byCategory: categoryOverdueMap
                },

                circulation: {
                    total: totalCirculation,
                    daily: dailyCirculation,
                    mostBorrowedBook,
                    monthlyTrends: {
                        currentMonth: currentMonthCirculation,
                        lastMonth: previousMonthCirculation,
                        growthRate: circulationGrowthRate.toFixed(2) + '%'
                    }
                },

                books: {
                    total: totalBooksCount,
                    byGenre: genreCounts,
                    byStatus: {
                        available: availableBooks,
                        borrowed: borrowedBooksCount,
                        reserved: reservedBooksTotal
                    },
                    growthTrend: {
                        currentMonth: booksCountCurrentMonth,
                        lastMonth: booksCountLastMonth,
                        twoMonthsAgo: booksCountTwoMonthsAgo,
                        threeMonthsAgo: booksCountThreeMonthsAgo
                    }
                },

                newBooks: {
                    total: newBooksCount,
                    recent: recentlyAddedBooks,
                    byCategory: newBookCategories
                },

                borrowedBooks: {
                    total: borrowedBooksCount,
                    dueDates: {
                        overdue: overdueBooksCount,
                        today: booksDueToday,
                        thisWeek: booksDueThisWeek,
                        nextWeek: booksDueNextWeek
                    },
                    popularCategories: borrowedGenreCounts,
                    trend: {
                        currentMonth: borrowedCountCurrentMonth,
                        lastMonth: borrowedCountLastMonth,
                        twoMonthsAgo: borrowedCountTwoMonthsAgo,
                        threeMonthsAgo: borrowedCountThreeMonthsAgo
                    }
                }
            }
        };

        handleSuccess(res, { success: true, data: analyticsData });
    } catch (error) {
        console.error("Error retrieving analytics:", error);
        next(error);
    }
}; 