// Test the tiered latency system
const axios = require("axios");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getOptimalDelay(totalPages) {
    if (totalPages <= 50) return 0;
    if (totalPages <= 99) return 100;
    return 200;
}

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

async function fetchTopic(url) {
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
    const response = await axios.get(jsonUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });
    return response.data;
}

async function testThread(url, description) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TEST: ${description}`);
    console.log("=".repeat(60));

    const startTime = Date.now();

    const initialData = await fetchTopic(url);
    const { title, post_stream } = initialData;
    const totalPosts = initialData.posts_count;
    let allPosts = [...post_stream.posts];

    const postsPerPage = 20;
    const totalPages = Math.ceil(totalPosts / postsPerPage);
    const delay = getOptimalDelay(totalPages);

    console.log(`Thread: ${title}`);
    console.log(`Total posts: ${totalPosts}`);
    console.log(`Total pages: ${totalPages}`);
    console.log(`Delay strategy: ${delay}ms`);

    if (totalPages > 1) {
        console.log(`\nFetching ${totalPages - 1} additional page(s)...`);
        for (let i = 2; i <= totalPages; i++) {
            if (delay > 0) await sleep(delay);
            const pageData = await fetchPage(url, i);
            if (pageData && pageData.post_stream && pageData.post_stream.posts) {
                const newPosts = pageData.post_stream.posts.filter(
                    (p) => !allPosts.find((existing) => existing.id === p.id)
                );
                allPosts = [...allPosts, ...newPosts];
            }
        }
    }

    const elapsed = Date.now() - startTime;
    const expectedMinTime = delay * (totalPages - 1);

    console.log(`\nResults:`);
    console.log(`  Posts collected: ${allPosts.length}/${totalPosts}`);
    console.log(`  Time taken: ${elapsed}ms`);
    console.log(`  Expected min time: ${expectedMinTime}ms`);
    console.log(`  Status: ${allPosts.length === totalPosts ? "✓ SUCCESS" : "✗ FAILED"}`);
}

async function runTests() {
    console.log("=".repeat(60));
    console.log("TIERED LATENCY SYSTEM TEST");
    console.log("=".repeat(60));

    // Test 1: Small thread (< 50 pages) - should use 0ms delay
    await testThread(
        "https://forum.valuepickr.com/t/ranjans-portfolio/45082",
        "Small Thread (2 pages) - 0ms delay"
    );

    await sleep(1000);

    // Test 2: Medium thread (< 100 pages) - should use 100ms delay
    // Note: Finding a thread with 51-99 pages is tricky, so we'll simulate
    console.log(`\n${"=".repeat(60)}`);
    console.log("DELAY FUNCTION UNIT TESTS");
    console.log("=".repeat(60));

    const testCases = [
        { pages: 1, expected: 0 },
        { pages: 10, expected: 0 },
        { pages: 50, expected: 0 },
        { pages: 51, expected: 100 },
        { pages: 75, expected: 100 },
        { pages: 99, expected: 100 },
        { pages: 100, expected: 200 },
        { pages: 150, expected: 200 },
        { pages: 500, expected: 200 },
    ];

    console.log("\nTesting getOptimalDelay function:");
    testCases.forEach(({ pages, expected }) => {
        const result = getOptimalDelay(pages);
        const status = result === expected ? "✓" : "✗";
        console.log(`  ${status} ${pages} pages → ${result}ms (expected: ${expected}ms)`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("ALL TESTS COMPLETED ✓");
    console.log("=".repeat(60));
}

runTests().catch(console.error);
