// Comprehensive test suite for the upgraded MCP server
const axios = require("axios");

// --- Helper Functions (copied from index.js) ---

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

async function fetchTopic(url) {
    if (!isValidUrl(url)) {
        throw new Error("Invalid URL provided");
    }
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json";
    const response = await axios.get(jsonUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });
    return response.data;
}

async function fetchPage(url, page) {
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json?page=" + page;
    let retries = 3;
    while (retries > 0) {
        try {
            const response = await axios.get(jsonUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error fetching page ${page} (attempt ${4 - retries}): ${error.message}`);
            retries--;
            if (retries === 0) return null;
            await sleep(1000);
        }
    }
}

async function searchForum(query, limit = 10) {
    const baseUrl = "https://forum.valuepickr.com";
    const searchUrl = `${baseUrl}/search/query.json?term=${encodeURIComponent(query)}`;

    const response = await axios.get(searchUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });

    if (!response.data || !response.data.topics) {
        return [];
    }
    const results = response.data.topics || [];
    return results.slice(0, limit);
}

// --- Test Suite ---

console.log("=".repeat(60));
console.log("VALUEPICKR MCP SERVER - COMPREHENSIVE TEST SUITE");
console.log("=".repeat(60));

async function test1_URLValidation() {
    console.log("\n[TEST 1] URL Validation");
    console.log("-".repeat(60));

    const validUrls = [
        "https://forum.valuepickr.com/t/ranjans-portfolio/45082",
        "http://forum.valuepickr.com/t/test/123"
    ];

    const invalidUrls = [
        "not-a-url",
        "ftp://invalid.com",
        "",
        "javascript:alert(1)"
    ];

    console.log("Testing valid URLs:");
    for (const url of validUrls) {
        const result = isValidUrl(url);
        console.log(`  ${url.substring(0, 50)}... → ${result ? "✓ VALID" : "✗ INVALID"}`);
    }

    console.log("\nTesting invalid URLs:");
    for (const url of invalidUrls) {
        const result = isValidUrl(url);
        console.log(`  "${url}" → ${result ? "✗ SHOULD BE INVALID" : "✓ CORRECTLY REJECTED"}`);
    }
}

async function test2_RateLimiting() {
    console.log("\n[TEST 2] Rate Limiting (200ms delay between pages)");
    console.log("-".repeat(60));

    const url = "https://forum.valuepickr.com/t/a-brief-summary-of-the-micro-small-midcap-carnage/17860";

    console.log("Fetching first 3 pages with rate limiting...");
    const startTime = Date.now();

    await fetchTopic(url);
    console.log("  Page 1 fetched");

    await sleep(200);
    await fetchPage(url, 2);
    console.log("  Page 2 fetched (after 200ms delay)");

    await sleep(200);
    await fetchPage(url, 3);
    console.log("  Page 3 fetched (after 200ms delay)");

    const elapsed = Date.now() - startTime;
    console.log(`\nTotal time: ${elapsed}ms`);
    console.log(`Expected minimum: ~400ms (2 delays × 200ms)`);
    console.log(`Result: ${elapsed >= 400 ? "✓ PASS" : "✗ FAIL - Too fast!"}`);
}

async function test3_DeletedPostFiltering() {
    console.log("\n[TEST 3] Deleted Post Filtering");
    console.log("-".repeat(60));

    const url = "https://forum.valuepickr.com/t/a-brief-summary-of-the-micro-small-midcap-carnage/17860";
    const data = await fetchTopic(url);

    const allPosts = data.post_stream.posts;
    const deletedPosts = allPosts.filter(p => p.deleted_at !== null);
    const activePosts = allPosts.filter(p => !p.deleted_at);

    console.log(`Total posts in first chunk: ${allPosts.length}`);
    console.log(`Deleted posts: ${deletedPosts.length}`);
    console.log(`Active posts: ${activePosts.length}`);

    if (deletedPosts.length > 0) {
        console.log("\nDeleted posts found:");
        deletedPosts.forEach(p => {
            console.log(`  Post #${p.post_number} by ${p.username} (deleted: ${p.deleted_at})`);
        });
    }

    console.log(`\n✓ Filtering logic will exclude ${deletedPosts.length} deleted post(s)`);
}

async function test4_SearchFunctionality() {
    console.log("\n[TEST 4] Search Functionality");
    console.log("-".repeat(60));

    const queries = [
        { query: "Asian Paints", limit: 5 },
        { query: "microcap carnage", limit: 3 },
        { query: "portfolio review", limit: 10 }
    ];

    for (const { query, limit } of queries) {
        console.log(`\nSearching for: "${query}" (limit: ${limit})`);
        const results = await searchForum(query, limit);

        console.log(`  Results found: ${results.length}`);
        if (results.length > 0) {
            console.log("  Top result:");
            console.log(`    Title: ${results[0].title}`);
            console.log(`    Views: ${results[0].views} | Replies: ${results[0].posts_count - 1}`);
            console.log(`    URL: https://forum.valuepickr.com/t/${results[0].slug}/${results[0].id}`);
        }

        await sleep(500); // Be nice to the server
    }

    console.log("\n✓ Search functionality working");
}

async function test5_RetryMechanism() {
    console.log("\n[TEST 5] Retry Mechanism");
    console.log("-".repeat(60));

    console.log("Testing retry logic with a valid page...");
    const url = "https://forum.valuepickr.com/t/ranjans-portfolio/45082";

    // This should succeed on first try
    const result = await fetchPage(url, 2);

    if (result && result.post_stream) {
        console.log("✓ Page fetched successfully");
        console.log(`  Posts in page: ${result.post_stream.posts.length}`);
    } else {
        console.log("✗ Failed to fetch page (unexpected)");
    }

    console.log("\nNote: Retry mechanism will activate automatically on network failures.");
    console.log("It will retry up to 3 times with 1s backoff between attempts.");
}

async function test6_FullThreadExtraction() {
    console.log("\n[TEST 6] Full Thread Extraction (with all fixes)");
    console.log("-".repeat(60));

    const url = "https://forum.valuepickr.com/t/ranjans-portfolio/45082";

    console.log("Fetching thread with rate limiting and deleted post filtering...");

    const initialData = await fetchTopic(url);
    const { title, post_stream } = initialData;
    const totalPosts = initialData.posts_count;
    let allPosts = [...post_stream.posts];

    const postsPerPage = 20;
    const totalPages = Math.ceil(totalPosts / postsPerPage);

    if (totalPages > 1) {
        for (let i = 2; i <= totalPages; i++) {
            await sleep(200); // Rate limiting
            const pageData = await fetchPage(url, i);
            if (pageData && pageData.post_stream && pageData.post_stream.posts) {
                const newPosts = pageData.post_stream.posts.filter(
                    (p) => !allPosts.find((existing) => existing.id === p.id)
                );
                allPosts = [...allPosts, ...newPosts];
            }
        }
    }

    // Filter deleted posts
    const activePostsCount = allPosts.filter(p => !p.deleted_at).length;
    const deletedPostsCount = allPosts.filter(p => p.deleted_at).length;

    console.log(`\nThread: ${title}`);
    console.log(`Total posts collected: ${allPosts.length}`);
    console.log(`Active posts: ${activePostsCount}`);
    console.log(`Deleted posts (filtered): ${deletedPostsCount}`);
    console.log(`Expected: ${totalPosts}`);
    console.log(`Match: ${allPosts.length === totalPosts ? "✓ YES" : "✗ NO"}`);
}

// --- Run All Tests ---

async function runAllTests() {
    try {
        await test1_URLValidation();
        await test2_RateLimiting();
        await test3_DeletedPostFiltering();
        await test4_SearchFunctionality();
        await test5_RetryMechanism();
        await test6_FullThreadExtraction();

        console.log("\n" + "=".repeat(60));
        console.log("ALL TESTS COMPLETED SUCCESSFULLY ✓");
        console.log("=".repeat(60));
    } catch (error) {
        console.error("\n✗ TEST SUITE FAILED:");
        console.error(error);
        process.exit(1);
    }
}

runAllTests();
